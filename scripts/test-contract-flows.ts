import { config } from "dotenv";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  filterContractRecords,
  listMergedContractRecords,
  sortContractRecords,
} from "@/lib/contract-list-service";
import {
  isAwaitingLegalPickup,
  isLegalReviewUnassigned,
  prepareContractForWorkflowAction,
} from "@/lib/legal-assignment";
import {
  buildRenewalIntakeInput,
  buildRenewalQueueEntry,
  computeDaysUntilDate,
  computeRenewalActionDeadline,
  deriveComputedRenewalStatus,
  listRenewalQueue,
  listRenewalReminderCandidates,
  reminderTypeForDays,
  resolveRenewalSettings,
  shouldAutoExpireContract,
} from "@/lib/renewal-workflow";
import {
  sanitizeAttachmentForClient,
  sanitizeContractRecordForClient,
} from "@/lib/contract-attachment-storage";
import {
  buildDocumentAlignment,
  compareDocumentTexts,
} from "@/lib/legal-review-comparison";
import {
  buildCompareSummaryLine,
  buildLegalReviewComparisonSummary,
  computeChangeStatistics,
} from "@/lib/legal-review-compare-view";
import {
  buildChangeLogFileName,
  generateChangeLogCsv,
} from "@/lib/legal-review-change-log";
import {
  buildCleanReviewFileName,
  generateCleanReviewDocx,
} from "@/lib/legal-review-clean-docx";
import { computeReviewStatistics } from "@/lib/legal-review-review-stats";
import {
  buildRedlineHtmlFileName,
  generateRedlineHtml,
} from "@/lib/legal-review-redline-html";
import {
  buildRedlinePdfFileName,
  generateRedlinePdf,
} from "@/lib/legal-review-redline-pdf";
import { generateRedlineDocx } from "@/lib/legal-review-redline";
import {
  blocksAreEquivalent,
  hasMaterialTextChange,
} from "@/lib/legal-review-text-diff";
import { extractDocxStructure } from "@/lib/legal-review-docx-structure";
import { compareDocumentStructures } from "@/lib/legal-review-structure-diff";
import { extractTextFromDocument } from "@/lib/obligation-document-text";
import {
  groupAttachmentsByVersion,
  normalizeContractAttachments,
  prepareAttachmentUpload,
} from "@/lib/contract-attachment-versions";
import {
  matchesContractSearchTerms,
  parseContractSearchTerms,
} from "@/lib/contract-search-service";
import { buildContractAttachmentStoragePath } from "@/lib/supabase-storage";
import { normalizeWorkflowPolicy } from "@/lib/workflow-policy-normalize";
import { reminderTypeForDay } from "@/lib/approval-escalation-service";
import {
  getCachedWorkflowPolicy,
  setCachedWorkflowPolicy,
} from "@/lib/platform-data-cache";
import { getWorkflowPolicy } from "@/lib/workflow-policy-read";
import { isDatabaseConfigured } from "@/lib/prisma";
import {
  approveAndPersist,
  createAndPersistContract,
  assignLegalReviewerAndPersist,
} from "@/lib/contract-persistence";
import {
  buildRelatedEmailFingerprint,
  hasMatchingRelatedEmail,
  normalizeEmailAddress,
} from "@/lib/contract-email-dedup";
import {
  extractRecordNumberFromSubject,
  formatContractEmailSubject,
} from "@/lib/email-sources";
import {
  isOrganizationWebhookAuthorized,
  resolveOutboundWebhookUrl,
  upsertOrganizationEmailConfig,
} from "@/lib/organization-email-config";
import type { ContractIntakeInput } from "@/types/contract";
import {
  approveContractStep,
  assignLegalReviewerStep,
  createContractFromIntake,
  getCurrentApprover,
  resolveWorkflowSteps,
} from "@/lib/workflow-engine";
import {
  reconcileContractWorkflowWithConfig,
  shouldSyncContractWorkflow,
} from "@/lib/workflow-contract-reconcile";
import { getDefaultWorkflowConfig } from "@/lib/workflow-store-defaults";
import { createCustomWorkflowStep } from "@/lib/workflow-config-types";
import { resolveWorkflowOrganizationId } from "@/lib/workflow-organization";
import { updateWorkflowConfig } from "@/lib/workflow-store";
import { mergeDocxPlaceholders } from "@/lib/contract-template-docx";
import JSZip from "jszip";

config({ path: resolve(process.cwd(), ".env.local") });
config({ path: resolve(process.cwd(), ".env") });

const ORG_ID = "default";
const LEGAL_USER = {
  email: "ajay.sharma.jd@gmail.com",
  name: "Ajay Sharma",
};
const BUSINESS_USER = {
  email: "marcus@example.com",
  name: "Marcus Test User",
};

type TestResult = {
  name: string;
  passed: boolean;
  detail: string;
};

const results: TestResult[] = [];

function pass(name: string, detail: string): void {
  results.push({ name, passed: true, detail });
  console.log(`✓ ${name} — ${detail}`);
}

function fail(name: string, detail: string): void {
  results.push({ name, passed: false, detail });
  console.error(`✗ ${name} — ${detail}`);
}

function assert(name: string, condition: boolean, detail: string): void {
  if (condition) {
    pass(name, detail);
  } else {
    fail(name, detail);
  }
}

function buildTestIntake(suffix: string): ContractIntakeInput {
  const today = new Date().toISOString().slice(0, 10);
  const nextYear = new Date();
  nextYear.setFullYear(nextYear.getFullYear() + 1);

  return {
    requesterName: BUSINESS_USER.name,
    requesterEmail: BUSINESS_USER.email,
    department: "Finance",
    contractType: "Vendor Agreement",
    contractStartDate: today,
    contractEndDate: nextYear.toISOString().slice(0, 10),
    contractTitle: `Automated flow test ${suffix}`,
    contractDescription: "Created by scripts/test-contract-flows.ts",
    contractAmount: "15000",
    budgeted: true,
    poNumber: "",
    otherNotes: "Automated test record — safe to delete",
    companyName: "Test Vendor LLC",
    address: "123 Test Street",
    mainContactName: "Taylor Test",
    mainContactEmail: "taylor@testvendor.com",
    companyProfileId: ORG_ID,
  };
}

function runWorkflowUnitTests(): void {
  const steps = resolveWorkflowSteps(15000, "Finance");
  const legalStep = steps.find((step) => step.id === "legal");

  assert(
    "New intake legal step starts unassigned",
    Boolean(legalStep && !legalStep.assigneeEmail.trim()),
    legalStep
      ? `legal assigneeEmail="${legalStep.assigneeEmail}"`
      : "missing legal step",
  );

  const draft = createContractFromIntake(buildTestIntake("unit"), {
    id: "test-unit-id",
    recordNumber: "CR-TEST-001",
  });

  assert(
    "Created intake is at legal review",
    draft.stage === "legal_review",
    `stage=${draft.stage}`,
  );

  assert(
    "Created intake awaits legal pickup",
    isAwaitingLegalPickup(draft),
    getCurrentApprover(draft)?.id ?? "no current step",
  );

  const pickedUp = assignLegalReviewerStep(draft, LEGAL_USER, LEGAL_USER);

  assert(
    "Pickup assigns legal owner",
    !isLegalReviewUnassigned(pickedUp),
    getCurrentApprover(pickedUp)?.assigneeEmail ?? "none",
  );

  assert(
    "Approve blocked before pickup on fresh draft",
    (() => {
      try {
        approveContractStep(draft, LEGAL_USER.email, LEGAL_USER.name);
        return false;
      } catch (error) {
        return (
          error instanceof Error &&
          error.message.includes("not been picked up")
        );
      }
    })(),
    "approve throws until pickup",
  );

  const autoPickupDraft = createContractFromIntake(buildTestIntake("auto-pickup"), {
    id: "test-auto-pickup-id",
    recordNumber: "CR-TEST-AUTO",
  });
  const preparedForApprove = prepareContractForWorkflowAction(
    autoPickupDraft,
    LEGAL_USER,
    "approve",
  );

  const autoApproved = approveContractStep(
    preparedForApprove,
    LEGAL_USER.email,
    LEGAL_USER.name,
    "Automated auto-pickup approval",
  );

  assert(
    "Auto pickup on approve assigns legal owner",
    autoApproved.workflowSteps.find((step) => step.id === "legal")
      ?.assigneeEmail === LEGAL_USER.email,
    LEGAL_USER.email,
  );

  assert(
    "Auto pickup on approve advances workflow",
    autoApproved.stage !== "legal_review",
    `stage=${autoApproved.stage}`,
  );

  const approved = approveContractStep(
    pickedUp,
    LEGAL_USER.email,
    LEGAL_USER.name,
    "Automated test approval",
  );

  assert(
    "Legal approval advances workflow",
    approved.stage !== "legal_review",
    `stage=${approved.stage}`,
  );

  const awaitingSignatureRecord = {
    ...approved,
    stage: "awaiting_signature" as const,
    updatedAt: "2026-08-01T00:00:00.000Z",
  };

  assert(
    "Awaiting signature excluded from pending review view",
    filterContractRecords([awaitingSignatureRecord], { view: "pending" })
      .length === 0,
    `stage=${awaitingSignatureRecord.stage}`,
  );

  assert(
    "Awaiting signature appears in signature view",
    filterContractRecords([awaitingSignatureRecord], { view: "signature" })
      .length === 1,
    `stage=${awaitingSignatureRecord.stage}`,
  );


  assert(
    "Unassigned view includes only pickup-ready legal review records",
    filterContractRecords([draft, pickedUp], { view: "unassigned" }).length === 1 &&
      filterContractRecords([draft, pickedUp], { view: "unassigned" })[0]?.id === draft.id,
    "unassigned filter",
  );

  assert(
    "My queue view includes only records owned by the legal user",
    filterContractRecords([draft, pickedUp], {
      view: "mine",
      legalOwnerEmail: LEGAL_USER.email,
    }).length === 1 &&
      filterContractRecords([draft, pickedUp], {
        view: "mine",
        legalOwnerEmail: LEGAL_USER.email,
      })[0]?.id === pickedUp.id,
    "mine filter",
  );

  assert(
    "My queue view excludes unassigned records",
    filterContractRecords([draft], {
      view: "mine",
      legalOwnerEmail: LEGAL_USER.email,
    }).length === 0,
    "mine excludes unassigned",
  );

  assert(
    "In-review contract excluded from signature view",
    filterContractRecords([pickedUp], { view: "signature" }).length === 0,
    `stage=${pickedUp.stage}`,
  );

  const sorted = sortContractRecords(
    [
      { ...draft, createdAt: "2026-01-01T00:00:00.000Z" },
      { ...pickedUp, createdAt: "2026-07-27T00:00:00.000Z" },
    ],
    "createdAt",
    "desc",
  );

  assert(
    "Pending queue sort prefers newest submission",
    sorted[0]?.createdAt.startsWith("2026-07-27") ?? false,
    sorted.map((item) => item.createdAt).join(", "),
  );

  assert(
    "Contract email subject tags record number",
    formatContractEmailSubject("CR-000042", "Updated terms") ===
      "[CR-000042] Updated terms",
    formatContractEmailSubject("CR-000042", "Updated terms"),
  );

  assert(
    "Record number extracted from tagged subject",
    extractRecordNumberFromSubject("[CR-000042] Updated terms") === "CR-000042",
    extractRecordNumberFromSubject("[CR-000042] Updated terms") ?? "none",
  );

  const fingerprint = buildRelatedEmailFingerprint({
    subject: "[CR-000042] Updated terms",
    from: "legal@example.com",
    to: "vendor@example.com",
    sentAt: "2026-07-31T12:34:56.000Z",
  });

  assert(
    "Duplicate provider email is skipped",
    hasMatchingRelatedEmail(
      [
        {
          id: "email-1",
          subject: "[CR-000042] Updated terms",
          from: "legal@example.com",
          to: "vendor@example.com",
          cc: "",
          sentAt: "2026-07-31T12:34:50.000Z",
          body: "Hello",
          source: "sent",
          direction: "outbound",
          providerMessageId: fingerprint,
          addedByName: "Legal User",
          addedByEmail: "legal@example.com",
          addedAt: "2026-07-31T12:34:56.000Z",
        },
      ],
      {
        subject: "[CR-000042] Updated terms",
        from: "legal@example.com",
        to: "vendor@example.com",
        sentAt: "2026-07-31T12:34:56.000Z",
      },
    ),
    fingerprint,
  );

  assert(
    "Formatted Graph addresses dedupe against bare emails",
    hasMatchingRelatedEmail(
      [
        {
          id: "email-2",
          subject: "[CR-000042] Updated terms",
          from: "legal@example.com",
          to: "vendor@example.com",
          cc: "",
          sentAt: "2026-07-31T12:34:50.000Z",
          body: "Hello",
          source: "sent",
          direction: "outbound",
          addedByName: "Legal User",
          addedByEmail: "legal@example.com",
          addedAt: "2026-07-31T12:34:56.000Z",
        },
      ],
      {
        subject: "[CR-000042] Updated terms",
        from: "Legal User <legal@example.com>",
        to: "Vendor Contact <vendor@example.com>",
        sentAt: "2026-07-31T12:34:56.000Z",
      },
    ),
    `${normalizeEmailAddress("Legal User <legal@example.com>")} matches bare email`,
  );
}

function makeWebhookRequest(secret: string): Request {
  return new Request("http://localhost/api/webhooks/contract-email", {
    headers: {
      "x-contract-email-secret": secret,
    },
  });
}

async function runEmailConfigUnitTests(): Promise<void> {
  const previousWebhookUrl = process.env.CONTRACT_EMAIL_WEBHOOK_URL;
  const previousWebhookSecret = process.env.CONTRACT_EMAIL_WEBHOOK_SECRET;
  const previousCronSecret = process.env.CRON_SECRET;

  process.env.CONTRACT_EMAIL_WEBHOOK_URL = "https://example.com/global-email-hook";
  process.env.CONTRACT_EMAIL_WEBHOOK_SECRET = "global-webhook-secret";
  delete process.env.CRON_SECRET;

  const defaultWebhookUrl = await resolveOutboundWebhookUrl("default");
  const acmeWebhookUrl = await resolveOutboundWebhookUrl("acme");

  assert(
    "Global outbound webhook applies only to default client",
    defaultWebhookUrl === "https://example.com/global-email-hook" &&
      acmeWebhookUrl === null,
    `default=${defaultWebhookUrl ?? "none"}, acme=${acmeWebhookUrl ?? "none"}`,
  );

  const defaultAuthorized = await isOrganizationWebhookAuthorized(
    "default",
    makeWebhookRequest("global-webhook-secret"),
  );
  const acmeAuthorized = await isOrganizationWebhookAuthorized(
    "acme",
    makeWebhookRequest("global-webhook-secret"),
  );

  assert(
    "Global inbound webhook secret applies only to default client",
    defaultAuthorized && !acmeAuthorized,
    `default=${defaultAuthorized}, acme=${acmeAuthorized}`,
  );

  let rejectedInvalidMailbox = false;

  try {
    await upsertOrganizationEmailConfig("default", {
      mailboxEmails: ["not-an-email"],
    });
  } catch (error) {
    rejectedInvalidMailbox =
      error instanceof Error && error.message.includes("Invalid mailbox email");
  }

  assert(
    "Invalid mailbox emails are rejected",
    rejectedInvalidMailbox,
    rejectedInvalidMailbox ? "validation error thrown" : "accepted invalid email",
  );

  if (previousWebhookUrl === undefined) {
    delete process.env.CONTRACT_EMAIL_WEBHOOK_URL;
  } else {
    process.env.CONTRACT_EMAIL_WEBHOOK_URL = previousWebhookUrl;
  }

  if (previousWebhookSecret === undefined) {
    delete process.env.CONTRACT_EMAIL_WEBHOOK_SECRET;
  } else {
    process.env.CONTRACT_EMAIL_WEBHOOK_SECRET = previousWebhookSecret;
  }

  if (previousCronSecret === undefined) {
    delete process.env.CRON_SECRET;
  } else {
    process.env.CRON_SECRET = previousCronSecret;
  }
}

async function runDatabaseIntegrationTests(): Promise<void> {
  if (!isDatabaseConfigured()) {
    pass(
      "Database integration tests",
      "Skipped — DATABASE_URL not configured in this environment",
    );
    return;
  }

  const createdIds: string[] = [];

  try {
    const suffix = Date.now().toString();
    const record = await createAndPersistContract(
      buildTestIntake(suffix),
      ORG_ID,
    );
    createdIds.push(record.id);

    assert(
      "Persisted submission saved to database",
      Boolean(record.id && record.recordNumber),
      record.recordNumber,
    );

    assert(
      "Persisted submission starts unassigned",
      isAwaitingLegalPickup(record),
      record.workflowSteps.find((step) => step.id === "legal")?.assigneeEmail ??
        "none",
    );

    const merged = await listMergedContractRecords(ORG_ID);
    const pending = filterContractRecords(merged, { view: "pending" });
    const foundPending = pending.some((contract) => contract.id === record.id);

    assert(
      "Submission appears in legal pending queue",
      foundPending,
      `pending count=${pending.length}`,
    );

    const autoApproved = await approveAndPersist(
      record.id,
      ORG_ID,
      LEGAL_USER.email,
      LEGAL_USER.name,
      "Automated DB auto-pickup approval",
    );

    assert(
      "Auto pickup on approve persists legal owner",
      autoApproved.workflowSteps.find((step) => step.id === "legal")
        ?.assigneeEmail === LEGAL_USER.email,
      LEGAL_USER.email,
    );

    assert(
      "Auto pickup on approve persists stage change",
      autoApproved.stage !== "legal_review",
      `stage=${autoApproved.stage}`,
    );

    const pickupRecord = await createAndPersistContract(
      buildTestIntake(`${suffix}-pickup`),
      ORG_ID,
    );
    createdIds.push(pickupRecord.id);

    const pickedUp = await assignLegalReviewerAndPersist(
      pickupRecord.id,
      ORG_ID,
      LEGAL_USER,
      LEGAL_USER,
    );

    assert(
      "Pickup persists legal owner",
      pickedUp.workflowSteps.find((step) => step.id === "legal")
        ?.assigneeEmail === LEGAL_USER.email,
      LEGAL_USER.email,
    );

    const approved = await approveAndPersist(
      pickupRecord.id,
      ORG_ID,
      LEGAL_USER.email,
      LEGAL_USER.name,
      "Automated DB test approval",
    );

    assert(
      "Legal approval persists stage change",
      approved.stage !== "legal_review",
      `stage=${approved.stage}`,
    );

    const mergedAfterApproval = await listMergedContractRecords(ORG_ID);
    const pendingAfterApproval = filterContractRecords(mergedAfterApproval, {
      view: "pending",
    });
    const signatureAfterApproval = filterContractRecords(mergedAfterApproval, {
      view: "signature",
    });

    assert(
      "Approved contracts removed from pending review queue",
      !pendingAfterApproval.some((contract) =>
        createdIds.includes(contract.id),
      ),
      `pending count=${pendingAfterApproval.length}`,
    );

    if (approved.stage === "awaiting_signature") {
      assert(
        "Approved contract appears in signature queue",
        signatureAfterApproval.some((contract) => contract.id === approved.id),
        `signature count=${signatureAfterApproval.length}`,
      );
    }
  } catch (error) {
    fail(
      "Database integration tests",
      error instanceof Error ? error.message : "Unknown database error",
    );
  } finally {
    if (createdIds.length > 0) {
      try {
        const { getPrismaClient } = await import("@/lib/prisma");
        const prisma = getPrismaClient();

        for (const id of createdIds) {
          await prisma.contract.delete({ where: { id } });
        }

        pass("Cleanup", `Deleted ${createdIds.length} test contract(s)`);
      } catch (error) {
        fail(
          "Cleanup",
          error instanceof Error
            ? error.message
            : "Could not delete test contract",
        );
      }
    }
  }
}

async function runTemplateMergeUnitTests(): Promise<void> {
  const zip = new JSZip();
  zip.file(
    "word/document.xml",
    `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
      <w:body>
        <w:p><w:r><w:t>Hello {{COMPANY_NAME}} for {{START_DATE}}.</w:t></w:r></w:p>
      </w:body>
    </w:document>`,
  );
  zip.file("[Content_Types].xml", "<Types></Types>");
  zip.file("_rels/.rels", "<Relationships></Relationships>");

  const sourceBuffer = Buffer.from(
    await zip.generateAsync({ type: "arraybuffer", compression: "DEFLATE" }),
  );

  const merged = await mergeDocxPlaceholders(sourceBuffer, {
    COMPANY_NAME: "Acme Corp",
    START_DATE: "2026-01-01",
  });

  const mergedZip = await JSZip.loadAsync(merged.buffer);
  const mergedXml = await mergedZip.file("word/document.xml")?.async("string");

  assert(
    "Template merge replaces placeholders",
    Boolean(
      mergedXml?.includes("Acme Corp") &&
        mergedXml.includes("2026-01-01") &&
        !mergedXml.includes("{{COMPANY_NAME}}"),
    ),
    mergedXml ?? "missing document.xml",
  );

  assert(
    "Template merge tracks merged variables",
    merged.mergedVariables.includes("COMPANY_NAME") &&
      merged.mergedVariables.includes("START_DATE") &&
      merged.missingVariables.length === 0,
    `merged=${merged.mergedVariables.join(",")} missing=${merged.missingVariables.join(",")}`,
  );

  const partialMerge = await mergeDocxPlaceholders(sourceBuffer, {
    COMPANY_NAME: "Acme Corp",
  });

  assert(
    "Template merge reports unfilled placeholders",
    partialMerge.missingVariables.includes("START_DATE"),
    partialMerge.missingVariables.join(", "),
  );
}

async function runTemplatePersistenceTests(): Promise<void> {
  if (!isDatabaseConfigured()) {
    pass("Template persistence tests", "Skipped without DATABASE_URL");
    return;
  }

  const { createContractTemplate, listContractTemplates } = await import(
    "@/lib/contract-template-store"
  );
  const { getPrismaClient } = await import("@/lib/prisma");

  const templateId = `template-test-${Date.now()}`;

  try {
    const created = await createContractTemplate({
      id: templateId,
      organizationId: ORG_ID,
      title: "Automated template persistence test",
      contractType: "nda",
      description: "Created by scripts/test-contract-flows.ts",
      file: {
        fileName: "test-template.docx",
        storagePath: `${ORG_ID}/${templateId}/v1/test-template.docx`,
        fileSize: 1024,
      },
      variables: [
        {
          name: "COMPANY_NAME",
          label: "Company name",
          fieldType: "text",
          isRequired: true,
          displayOrder: 0,
        },
      ],
      uploadedById: LEGAL_USER.email,
      isActive: true,
      showInIntake: true,
      isDefault: false,
    });

    const listed = await listContractTemplates(ORG_ID);

    assert(
      "Created template appears in template list",
      listed.some((template) => template.id === created.template.id),
      `created=${created.template.id}`,
    );
  } catch (error) {
    fail(
      "Template persistence tests",
      error instanceof Error ? error.message : "Unknown template persistence error",
    );
  } finally {
    try {
      const prisma = getPrismaClient();
      await prisma.contractTemplate.delete({ where: { id: templateId } });
      pass("Template persistence cleanup", `Deleted test template ${templateId}`);
    } catch (error) {
      fail(
        "Template persistence cleanup",
        error instanceof Error ? error.message : "Could not delete test template",
      );
    }
  }
}

function runRenewalWorkflowUnitTests(): void {
  const activeContract = createContractFromIntake(
    {
      ...buildTestIntake("renewal"),
      contractEndDate: "2026-09-01",
      otherNotes: "Auto renewal enabled with 30-day notice period.",
    },
    {
      id: "renewal-test-id",
      recordNumber: "CR-RENEWAL-001",
    },
  );

  const activeWithStage = {
    ...activeContract,
    stage: "active" as const,
    contractEndDate: "2026-09-01",
  };

  const settings = resolveRenewalSettings(activeWithStage);

  assert(
    "Renewal settings inferred from notes",
    settings.autoRenewal && settings.renewalNoticeDays === 30,
    `autoRenewal=${settings.autoRenewal}, notice=${settings.renewalNoticeDays}`,
  );

  assert(
    "Renewal action deadline subtracts notice period",
    computeRenewalActionDeadline("2026-09-01", 30) === "2026-08-02",
    computeRenewalActionDeadline("2026-09-01", 30) ?? "none",
  );

  assert(
    "Reminder type maps to threshold day",
    reminderTypeForDays(30) === "notice_30",
    reminderTypeForDays(30) ?? "none",
  );

  const entry = buildRenewalQueueEntry(activeWithStage, "2026-08-15");

  assert(
    "Renewal queue includes active contract in notice window",
    Boolean(entry && entry.displayStatus === "notice_window"),
    entry?.displayStatus ?? "missing entry",
  );

  assert(
    "Renewal queue filter returns notice-window contracts",
    listRenewalQueue([activeWithStage], { windowDays: 90 }, "2026-08-15").length ===
      1,
    "filtered count",
  );

  const reminderCandidates = listRenewalReminderCandidates(
    [activeWithStage],
    "2026-08-02",
  );

  assert(
    "Action deadline generates reminder candidate",
    reminderCandidates.some(
      (candidate) => candidate.reminderType === "action_deadline",
    ),
    `count=${reminderCandidates.length}`,
  );

  assert(
    "Manual contracts past expiration should auto-expire",
    shouldAutoExpireContract(
      {
        ...activeWithStage,
        autoRenewal: false,
        renewalStatus: "not_due",
      },
      "2026-09-02",
    ),
    "expected auto-expire",
  );

  const renewalIntake = buildRenewalIntakeInput(activeWithStage, LEGAL_USER);

  assert(
    "Renewal intake links to parent agreement",
    renewalIntake.parentAgreementId === activeWithStage.id,
    renewalIntake.parentAgreementId ?? "none",
  );

  assert(
    "Computed renewal status enters notice window",
    deriveComputedRenewalStatus(activeWithStage, "2026-08-15") ===
      "notice_window",
    deriveComputedRenewalStatus(activeWithStage, "2026-08-15"),
  );

  assert(
    "Days until expiration calculated correctly",
    computeDaysUntilDate("2026-09-01", "2026-08-15") === 17,
    String(computeDaysUntilDate("2026-09-01", "2026-08-15")),
  );
}

function runWorkflowPolicyUnitTests(): void {
  const normalized = normalizeWorkflowPolicy({
    notifyAssigneesByEmail: false,
    approvalReminderDays: [7, 3, 3],
    escalateAfterDays: -2,
  });

  assert(
    "Workflow policy normalization dedupes reminder days",
    normalized.approvalReminderDays.join(",") === "3,7",
    normalized.approvalReminderDays.join(","),
  );

  assert(
    "Workflow policy normalization clamps escalation days",
    normalized.escalateAfterDays === 0,
    String(normalized.escalateAfterDays),
  );

  const filteredDays = normalizeWorkflowPolicy({
    approvalReminderDays: [2, 5, 3],
  });

  assert(
    "Workflow policy normalization keeps supported reminder days only",
    filteredDays.approvalReminderDays.join(",") === "3",
    filteredDays.approvalReminderDays.join(","),
  );

  const emptyDays = normalizeWorkflowPolicy({
    approvalReminderDays: [],
  });

  assert(
    "Workflow policy normalization restores default reminder days",
    emptyDays.approvalReminderDays.join(",") === "1,3,7",
    emptyDays.approvalReminderDays.join(","),
  );

  assert(
    "Reminder type maps day 14 correctly",
    reminderTypeForDay(14) === "reminder_14",
    reminderTypeForDay(14),
  );

  const parallelDraft = createContractFromIntake(
    {
      ...buildTestIntake("parallel"),
      contractAmount: "75000",
    },
    {
      id: "parallel-test-id",
      recordNumber: "CR-PARALLEL-001",
    },
  );

  const originalPolicy =
    getCachedWorkflowPolicy(ORG_ID) ?? getWorkflowPolicy(ORG_ID);
  const parallelPolicy = {
    ...originalPolicy,
    allowParallelApprovals: true,
    requireAllApprovers: false,
  };

  setCachedWorkflowPolicy(ORG_ID, parallelPolicy);

  const parallelResolved = resolveWorkflowSteps(
    75000,
    parallelDraft.department,
    parallelDraft.contractType,
    ORG_ID,
  );

  assert(
    "Parallel policy activates all workflow steps",
    parallelResolved.every((step) => step.status === "current"),
    parallelResolved.map((step) => step.status).join(","),
  );

  const parallelContract = {
    ...parallelDraft,
    workflowSteps: parallelResolved.map((step) =>
      step.id === "legal"
        ? {
            ...step,
            assigneeEmail: LEGAL_USER.email,
            assigneeName: LEGAL_USER.name,
          }
        : step,
    ),
  };

  const parallelApproved = approveContractStep(
    parallelContract,
    LEGAL_USER.email,
    LEGAL_USER.name,
    "Parallel OR approval",
  );

  assert(
    "Parallel OR policy finalizes after first approval",
    ["awaiting_signature", "active"].includes(parallelApproved.stage),
    parallelApproved.stage,
  );

  const parallelOrPartial = approveContractStep(
    {
      ...parallelDraft,
      workflowSteps: parallelResolved,
    },
    parallelResolved.find((step) => step.id === "department-vp")!.assigneeEmail,
    parallelResolved.find((step) => step.id === "department-vp")!.assigneeName,
    "Parallel OR partial approval",
  );

  assert(
    "Parallel OR keeps legal pending when non-legal approves first",
    parallelOrPartial.stage === "legal_review" &&
      parallelOrPartial.workflowSteps.find((step) => step.id === "legal")
        ?.status === "current",
    parallelOrPartial.stage,
  );

  setCachedWorkflowPolicy(ORG_ID, originalPolicy);
}


function runContractSearchUnitTests(): void {
  const terms = parseContractSearchTerms("  Acme   PO-123 ");
  assert(
    "Contract search parses multi-term query",
    terms.join(",") === "acme,po-123",
    terms.join(","),
  );

  const sample = createContractFromIntake(buildTestIntake("search"), {
    id: "search-test-id",
    recordNumber: "CR-SEARCH-001",
  });

  assert(
    "Contract search matches record number terms",
    matchesContractSearchTerms(sample, ["cr-search"]),
    sample.recordNumber,
  );

  assert(
    "Contract search requires all terms",
    !matchesContractSearchTerms(sample, ["cr-search", "missing-term"]),
    sample.title,
  );

  assert(
    "Contract search matches counterparty terms",
    matchesContractSearchTerms(sample, ["test", "vendor"]),
    sample.companyName,
  );

  assert(
    "Contract search matches workflow assignee text",
    matchesContractSearchTerms(
      {
        ...sample,
        workflowSteps: [
          {
            id: "legal",
            name: "Legal Review",
            role: "Legal",
            assigneeEmail: "legal@example.com",
            assigneeName: "Legal Reviewer",
            status: "current",
          },
        ],
      },
      ["legal@example.com"],
    ),
    "workflow assignee",
  );
}



function runAttachmentStorageUnitTests(): void {
  const path = buildContractAttachmentStoragePath(
    "default",
    "contract-123",
    "att-456",
    "Vendor Agreement.pdf",
  );

  assert(
    "Attachment storage path includes contract and attachment ids",
    path.includes("contract-123") && path.includes("att-456"),
    path,
  );

  const sanitized = sanitizeAttachmentForClient({
    id: "att-1",
    title: "Test.pdf",
    fileName: "Test.pdf",
    mimeType: "application/pdf",
    sizeBytes: 100,
    documentType: "supporting_document",
    uploadedAt: "2026-01-01T00:00:00.000Z",
    uploadedByName: "Tester",
    uploadedByEmail: "tester@example.com",
    storagePath: "contracts/default/c1/attachments/att-1/Test.pdf",
    dataBase64: "abc123",
  });

  assert(
    "Attachment client payload omits base64 content",
    Boolean(
      sanitized.storagePath?.includes("attachments/att-1") &&
        !("dataBase64" in sanitized),
    ),
    JSON.stringify(sanitized),
  );

  const record = createContractFromIntake(buildTestIntake("attachment-sanitize"), {
    id: "attachment-sanitize-id",
    recordNumber: "CR-ATT-001",
  });

  const sanitizedRecord = sanitizeContractRecordForClient(record);

  assert(
    "Contract client payload strips attachment base64 blobs",
    sanitizedRecord.attachments.every((attachment) => !("dataBase64" in attachment)),
    String(sanitizedRecord.attachments.length),
  );
}


async function runWorkflowSyncUnitTests(): Promise<void> {
  const draft = createContractFromIntake(
    { ...buildTestIntake("workflow-sync"), contractAmount: "30000" },
    {
      id: "workflow-sync-id",
      recordNumber: "CR-WF-SYNC-001",
    },
  );

  assert(
    "Non-active contracts should receive workflow sync",
    shouldSyncContractWorkflow(draft),
    draft.stage,
  );

  assert(
    "Active contracts skip workflow sync",
    !shouldSyncContractWorkflow({ ...draft, stage: "active" }),
    "active",
  );

  assert(
    "Awaiting signature contracts skip workflow sync",
    !shouldSyncContractWorkflow({ ...draft, stage: "awaiting_signature" }),
    "awaiting_signature",
  );

  assert(
    "Rejected contracts skip workflow sync",
    !shouldSyncContractWorkflow({ ...draft, stage: "rejected" }),
    "rejected",
  );

  assert(
    "Legacy workflow org ids resolve to default",
    resolveWorkflowOrganizationId("seed-org-001") === ORG_ID,
    resolveWorkflowOrganizationId("seed-org-001"),
  );

  const pickedUp = assignLegalReviewerStep(
    draft,
    { email: LEGAL_USER.email, name: LEGAL_USER.name },
    LEGAL_USER,
  );

  const updatedConfig = structuredClone(getDefaultWorkflowConfig());
  const financeStep = updatedConfig.steps.find((step) => step.id === "finance");

  if (!financeStep) {
    throw new Error("Finance workflow step missing from default config.");
  }

  financeStep.assigneeEmail = "workflow-sync-finance@example.com";
  financeStep.assigneeName = "Workflow Sync Finance";

  await updateWorkflowConfig(updatedConfig, ORG_ID);

  const reconciledDraft = reconcileContractWorkflowWithConfig(draft, ORG_ID);
  const reconciledFinance = reconciledDraft.workflowSteps.find(
    (step) => step.id === "finance",
  );

  assert(
    "Workflow sync applies updated assignees to non-active contracts",
    reconciledFinance?.assigneeEmail === "workflow-sync-finance@example.com",
    reconciledFinance?.assigneeEmail ?? "missing finance step",
  );

  const reconciledPickedUp = reconcileContractWorkflowWithConfig(
    pickedUp,
    ORG_ID,
  );
  const reconciledLegal = reconciledPickedUp.workflowSteps.find(
    (step) => step.id === "legal",
  );

  assert(
    "Workflow sync preserves picked-up legal owner",
    reconciledLegal?.assigneeEmail === LEGAL_USER.email,
    reconciledLegal?.assigneeEmail ?? "missing legal step",
  );

  const customStep = createCustomWorkflowStep();
  customStep.name = "Security review";
  customStep.assigneeEmail = "security@example.com";
  customStep.assigneeName = "Security Team";

  const configWithCustomStep = structuredClone(getDefaultWorkflowConfig());
  const legalIndex = configWithCustomStep.steps.findIndex(
    (step) => step.id === "legal",
  );
  configWithCustomStep.steps.splice(legalIndex + 1, 0, customStep);

  await updateWorkflowConfig(configWithCustomStep, ORG_ID);

  const newSubmission = createContractFromIntake(buildTestIntake("custom-step"), {
    id: "workflow-custom-step-id",
    recordNumber: "CR-WF-CUSTOM-001",
  });
  const customWorkflowStep = newSubmission.workflowSteps.find(
    (step) => step.id === customStep.id,
  );

  assert(
    "New submissions include admin-added approval steps",
    Boolean(customWorkflowStep),
    customWorkflowStep?.name ?? "missing custom step",
  );

  const reconciledWithCustomStep = reconcileContractWorkflowWithConfig(
    draft,
    ORG_ID,
  );

  assert(
    "Existing non-active contracts gain admin-added approval steps",
    reconciledWithCustomStep.workflowSteps.some(
      (step) => step.id === customStep.id,
    ),
    reconciledWithCustomStep.workflowSteps.map((step) => step.id).join(", "),
  );

  await updateWorkflowConfig(getDefaultWorkflowConfig(), ORG_ID);
}


function runAttachmentVersionUnitTests(): void {
  const legacyAttachment = {
    id: "att-legacy",
    title: "Legacy.pdf",
    fileName: "Legacy.pdf",
    mimeType: "application/pdf",
    sizeBytes: 100,
    documentType: "supporting_document" as const,
    uploadedAt: "2026-01-01T00:00:00.000Z",
    uploadedByName: "Tester",
    uploadedByEmail: "tester@example.com",
  };

  const normalizedLegacy = normalizeContractAttachments([legacyAttachment])[0];

  assert(
    "Legacy attachments default to version 1 current",
    normalizedLegacy.versionNumber === 1 &&
      normalizedLegacy.isCurrent === true &&
      normalizedLegacy.versionGroupId === "att-legacy",
    JSON.stringify(normalizedLegacy),
  );

  const currentAttachment = {
    ...legacyAttachment,
    id: "att-current",
    versionGroupId: "grp-1",
    versionNumber: 1,
    isCurrent: true,
  };

  const prepared = prepareAttachmentUpload(
    [currentAttachment],
    "supporting_document",
  );

  assert(
    "Uploading the same document type archives the prior current version",
    prepared.versionNumber === 2 &&
      prepared.replacesPriorVersion === true &&
      prepared.updatedAttachments[0]?.isCurrent === false,
    JSON.stringify(prepared),
  );

  const versionedAttachments = [
    ...prepared.updatedAttachments,
    {
      ...currentAttachment,
      id: "att-current-v2",
      fileName: "Legacy v2.pdf",
      title: "Legacy v2.pdf",
      versionGroupId: prepared.versionGroupId,
      versionNumber: prepared.versionNumber,
      isCurrent: true,
      uploadedAt: "2026-02-01T00:00:00.000Z",
    },
  ];


  const duplicateCurrent = normalizeContractAttachments([
    {
      id: "att-v1",
      title: "Draft v1.pdf",
      fileName: "Draft v1.pdf",
      mimeType: "application/pdf",
      sizeBytes: 100,
      documentType: "third_party_document",
      uploadedAt: "2026-01-01T00:00:00.000Z",
      uploadedByName: "Tester",
      uploadedByEmail: "tester@example.com",
      versionGroupId: "grp-dup",
      versionNumber: 1,
      isCurrent: true,
    },
    {
      id: "att-v2",
      title: "Draft v2.pdf",
      fileName: "Draft v2.pdf",
      mimeType: "application/pdf",
      sizeBytes: 100,
      documentType: "third_party_document",
      uploadedAt: "2026-02-01T00:00:00.000Z",
      uploadedByName: "Tester",
      uploadedByEmail: "tester@example.com",
      versionGroupId: "grp-dup",
      versionNumber: 2,
      isCurrent: true,
    },
  ]);

  assert(
    "Duplicate current flags collapse to the highest version",
    duplicateCurrent.filter((attachment) => attachment.isCurrent).length === 1 &&
      duplicateCurrent.find((attachment) => attachment.isCurrent)?.id === "att-v2",
    JSON.stringify(duplicateCurrent),
  );

  const groups = groupAttachmentsByVersion(versionedAttachments);

  assert(
    "Attachment groups expose one current and one prior version",
    groups.length === 1 &&
      groups[0]?.current.id === "att-current-v2" &&
      groups[0]?.priorVersions.length === 1,
    JSON.stringify(groups),
  );
}



function runLegalReviewUnitTests(): void {
  const comparison = compareDocumentTexts({
    baselineText:
      "Limitation of liability. Each party liability shall not exceed fees paid in twelve months.\n\nTermination. Either party may terminate for material breach.",
    counterpartyText:
      "Limitation of liability. Each party liability shall not exceed two times fees paid in twelve months.\n\nTermination. Either party may terminate for material breach with thirty days notice.",
  });

  assert(
    "Document comparison detects modified agreement language",
    comparison.deviations.some((item) => item.kind === "modified"),
    JSON.stringify(comparison),
  );

  assert(
    "Comparison summary reports deviation count",
    comparison.summary.includes("deviation"),
    comparison.summary,
  );

  const liabilityBaseline =
    "Limitation of Liability. Except for excluded liabilities, each party's aggregate liability arising out of or related to this Agreement shall not exceed the total fees paid or payable by Customer to Vendor in the twelve (12) months preceding the event giving rise to the claim.";
  const liabilityCounterparty =
    "Limitation of Liability. Except for excluded liabilities, each party's aggregate liability arising out of or related to this Agreement shall not exceed two times (2x) the total fees paid or payable by Customer to Vendor in the twelve (12) months preceding the event giving rise to the claim.";

  assert(
    "High-similarity liability cap edits are treated as material",
    hasMaterialTextChange(liabilityBaseline, liabilityCounterparty),
    "liability cap change was treated as unchanged",
  );

  assert(
    "High-similarity liability cap blocks are not equivalent",
    !blocksAreEquivalent(liabilityBaseline, liabilityCounterparty),
    "liability cap blocks were treated as equivalent",
  );

  const shortClauseComparison = compareDocumentTexts({
    baselineText: "Fees: $100 per month.",
    counterpartyText: "Fees: $200 per month.",
  });

  assert(
    "Short fee clauses are still compared",
    shortClauseComparison.deviations.some((item) => item.kind === "modified"),
    JSON.stringify(shortClauseComparison),
  );

  const pageNoiseComparison = compareDocumentTexts({
    baselineText:
      "Limitation of Liability. Each party's aggregate liability shall not exceed fees paid in twelve months. Page 1 of 10",
    counterpartyText:
      "Limitation of Liability. Each party's aggregate liability shall not exceed fees paid in twelve months. Page 2 of 10",
  });

  assert(
    "Page-number extraction noise is not treated as a material edit",
    pageNoiseComparison.deviations.length === 0,
    JSON.stringify(pageNoiseComparison),
  );

  const moveBaseline =
    "Introductory paragraph for the agreement between the parties.\n\nInsurance coverage shall be maintained at all times during the term of this agreement.\n\nClosing paragraph regarding notices and general provisions.";
  const moveCounterparty =
    "Introductory paragraph for the agreement between the parties.\n\nClosing paragraph regarding notices and general provisions.\n\nInsurance coverage shall be maintained at all times during the term of this agreement.";

  const moveComparison = compareDocumentTexts({
    baselineText: moveBaseline,
    counterpartyText: moveCounterparty,
  });

  assert(
    "Relocated sections are grouped as moved deviations",
    moveComparison.deviations.some((item) => item.kind === "moved"),
    JSON.stringify(moveComparison.deviations.map((item) => item.kind)),
  );

  const moveAlignment = buildDocumentAlignment({
    baselineText: moveBaseline,
    counterpartyText: moveCounterparty,
  });

  assert(
    "Relocated sections annotate alignment blocks for redline export",
    moveAlignment.some((block) => block.kind === "moved"),
    JSON.stringify(moveAlignment.map((block) => block.kind)),
  );

  const moveStats = computeChangeStatistics(moveComparison.deviations);

  assert(
    "Compare statistics count relocated changes",
    moveStats.moved >= 1,
    JSON.stringify(moveStats),
  );

  assert(
    "Compare summary line includes relocation counts",
    buildCompareSummaryLine(moveStats).includes("relocation"),
    buildCompareSummaryLine(moveStats),
  );
}

async function runLegalReviewFixtureUnitTests(): Promise<void> {
  const baselineBuffer = readFileSync(
    resolve("scripts/fixtures/legal-review/northwind-baseline-v1.docx"),
  );
  const counterpartyBuffer = readFileSync(
    resolve("scripts/fixtures/legal-review/northwind-counterparty-v2.docx"),
  );

  const baselineText = (
    await extractTextFromDocument(baselineBuffer, "northwind-baseline-v1.docx")
  ).trim();
  const counterpartyText = (
    await extractTextFromDocument(
      counterpartyBuffer,
      "northwind-counterparty-v2.docx",
    )
  ).trim();

  const comparison = compareDocumentTexts({
    baselineText,
    counterpartyText,
  });

  assert(
    "Northwind fixtures detect liability, termination, and payment edits",
    comparison.deviations.filter((item) => item.kind === "modified").length === 3,
    JSON.stringify(
      comparison.deviations.map((item) => ({
        kind: item.kind,
        title: item.title,
        summary: item.summary,
      })),
    ),
  );

  assert(
    "Northwind liability cap deviation is flagged despite high similarity",
    comparison.deviations.some(
      (item) =>
        item.kind === "modified" &&
        /liabilit/i.test(item.title) &&
        /numeric|term value/i.test(item.summary),
    ),
    JSON.stringify(comparison.deviations),
  );

  const alignment = buildDocumentAlignment({
    baselineText,
    counterpartyText,
  });

  assert(
    "Northwind redline alignment marks liability block as modified",
    alignment.some(
      (block) =>
        block.kind === "modified" &&
        /liabilit/i.test(block.baselineText) &&
        /2x|two times/i.test(block.counterpartyText),
    ),
    JSON.stringify(alignment.map((block) => block.kind)),
  );

  const buffer = await generateRedlineDocx({
    roundNumber: 1,
    baselineFileName: "northwind-baseline-v1.docx",
    counterpartyFileName: "northwind-counterparty-v2.docx",
    baselineText,
    counterpartyText,
    comparisonSummary: comparison.summary,
    generatedByName: "Legal Review",
  });

  const zip = await JSZip.loadAsync(buffer);
  const documentXml = await zip.file("word/document.xml")!.async("string");

  assert(
    "Northwind redline docx includes track changes",
    documentXml.includes("<w:ins") && documentXml.includes("<w:del"),
    documentXml.slice(0, 500),
  );

  assert(
    "Northwind redline docx marks liability cap insertion",
    /two times|\(2x\)/i.test(documentXml),
    documentXml.slice(0, 500),
  );
}

async function runLegalReviewLiteraParityUnitTests(): Promise<void> {
  const comparison = compareDocumentTexts({
    baselineText:
      "Intro paragraph for the agreement.\n\nInsurance coverage shall be maintained during the term.\n\nPayment is due within thirty days.",
    counterpartyText:
      "Intro paragraph for the agreement.\n\nPayment is due within forty-five days.\n\nInsurance coverage shall be maintained during the term.",
  });
  const alignment = buildDocumentAlignment({
    baselineText:
      "Intro paragraph for the agreement.\n\nInsurance coverage shall be maintained during the term.\n\nPayment is due within thirty days.",
    counterpartyText:
      "Intro paragraph for the agreement.\n\nPayment is due within forty-five days.\n\nInsurance coverage shall be maintained during the term.",
  });

  assert(
    "Litera parity detects relocated sections in alignment",
    alignment.some((block) => block.kind === "moved"),
    JSON.stringify(alignment.map((block) => block.kind)),
  );

  const reviewStats = computeReviewStatistics(comparison.deviations);
  assert(
    "Review statistics start with all changes open",
    reviewStats.open === comparison.deviations.length,
    JSON.stringify(reviewStats),
  );

  const reviewed = comparison.deviations.map((deviation, index) => ({
    ...deviation,
    status: index === 0 ? ("accepted" as const) : deviation.status,
  }));
  const partialReviewStats = computeReviewStatistics(reviewed);

  assert(
    "Review statistics track accepted changes",
    partialReviewStats.accepted === 1 && partialReviewStats.percentComplete > 0,
    JSON.stringify(partialReviewStats),
  );

  const round = {
    id: "round-test",
    roundNumber: 2,
    status: "open" as const,
    versionGroupId: null,
    baselineAttachmentId: "b1",
    counterpartyAttachmentId: "c1",
    baselineFileName: "baseline.docx",
    counterpartyFileName: "counterparty.docx",
    startedAt: new Date().toISOString(),
    completedAt: null,
    startedByName: "Legal Review",
    startedByEmail: "legal@example.com",
    comparedAt: new Date().toISOString(),
    comparisonSummary: comparison.summary,
    documentAlignment: alignment,
    deviations: reviewed,
    comments: [],
    documentReadiness: [],
  };

  const csv = generateChangeLogCsv(round);
  assert(
    "Change log CSV includes deviation headers and rows",
    csv.includes("Change Number") &&
      csv.split("\n").length > comparison.deviations.length,
    csv.slice(0, 200),
  );
  assert(
    "Change log file name follows round naming convention",
    buildChangeLogFileName(2) === "legal-review-round-2-change-log.csv",
    buildChangeLogFileName(2),
  );

  const html = generateRedlineHtml({
    roundNumber: 2,
    baselineFileName: round.baselineFileName,
    counterpartyFileName: round.counterpartyFileName,
    comparisonSummary: comparison.summary,
    alignment,
  });
  assert(
    "HTML redline export includes styled insertions and deletions",
    html.includes("<ins>") || html.includes("<del>") || html.includes("class=\"modified\""),
    html.slice(0, 300),
  );
  assert(
    "HTML redline file name follows round naming convention",
    buildRedlineHtmlFileName(2) === "legal-review-round-2-redline.html",
    buildRedlineHtmlFileName(2),
  );

  const pdfBuffer = await generateRedlinePdf({
    roundNumber: 2,
    baselineFileName: round.baselineFileName,
    counterpartyFileName: round.counterpartyFileName,
    comparisonSummary: comparison.summary,
    alignment,
  });
  assert(
    "PDF redline export generates a PDF document",
    pdfBuffer.length > 500 &&
      pdfBuffer[0] === 0x25 &&
      pdfBuffer[1] === 0x50 &&
      pdfBuffer[2] === 0x44 &&
      pdfBuffer[3] === 0x46,
    String(pdfBuffer.length),
  );
  assert(
    "PDF redline file name follows round naming convention",
    buildRedlinePdfFileName(2) === "legal-review-round-2-redline.pdf",
    buildRedlinePdfFileName(2),
  );

  const cleanBuffer = await generateCleanReviewDocx({
    roundNumber: 2,
    baselineFileName: round.baselineFileName,
    counterpartyFileName: round.counterpartyFileName,
    alignment,
    deviations: reviewed,
  });
  const cleanZip = await JSZip.loadAsync(cleanBuffer);
  const cleanXml = await cleanZip.file("word/document.xml")!.async("string");
  assert(
    "Clean draft DOCX is generated from review decisions",
    cleanXml.includes("Clean agreement draft") && cleanBuffer[0] === 0x50,
    cleanXml.slice(0, 200),
  );
  assert(
    "Clean draft file name follows round naming convention",
    buildCleanReviewFileName(2) === "legal-review-round-2-clean-draft.docx",
    buildCleanReviewFileName(2),
  );

  assert(
    "Compare summary line still renders change counts",
    buildCompareSummaryLine(computeChangeStatistics(comparison.deviations)).length >
      0,
    buildCompareSummaryLine(computeChangeStatistics(comparison.deviations)),
  );
}

async function createStructureTestDocx(options: {
  boldLimitation?: boolean;
  feeAmount?: string;
  includeImage?: boolean;
  footnoteText?: string;
}): Promise<Buffer> {
  const limitationRun = options.boldLimitation
    ? "<w:r><w:rPr><w:b/></w:rPr><w:t>Limitation of Liability cap equals one times annual fees.</w:t></w:r>"
    : "<w:r><w:t>Limitation of Liability cap equals one times annual fees.</w:t></w:r>";
  const imageParagraph = options.includeImage
    ? `<w:p><w:r><w:drawing><wp:inline xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><wp:docPr descr="Company Logo" name="Picture 1"/><a:graphic/></wp:inline></w:drawing></w:r></w:p>`
    : "";
  const footnoteReference = options.footnoteText
    ? `<w:p><w:r><w:t>Payment terms apply.</w:t></w:r><w:r><w:footnoteReference w:id="1"/></w:r></w:p>`
    : "";
  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p>${limitationRun}</w:p>
    <w:tbl>
      <w:tr>
        <w:tc><w:p><w:r><w:t>Fee Cap</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>${options.feeAmount ?? "100000"}</w:t></w:r></w:p></w:tc>
      </w:tr>
      <w:tr>
        <w:tc><w:p><w:r><w:t>Term</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>12 months</w:t></w:r></w:p></w:tc>
      </w:tr>
    </w:tbl>
    ${imageParagraph}
    ${footnoteReference}
  </w:body>
</w:document>`;
  const footnotesXml = options.footnoteText
    ? `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:footnotes xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:footnote w:id="1"><w:p><w:r><w:t>${options.footnoteText}</w:t></w:r></w:p></w:footnote>
</w:footnotes>`
    : undefined;

  const zip = new JSZip();
  zip.file(
    "[Content_Types].xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>${footnotesXml ? `<Override PartName="/word/footnotes.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footnotes+xml"/>` : ""}
</Types>`,
  );
  zip.file(
    "_rels/.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`,
  );
  zip.file(
    "word/_rels/document.xml.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footnotes" Target="footnotes.xml"/>
</Relationships>`,
  );
  zip.file("word/document.xml", documentXml);
  if (footnotesXml) {
    zip.file("word/footnotes.xml", footnotesXml);
  }

  return zip.generateAsync({ type: "nodebuffer" });
}

async function runLegalReviewStructureUnitTests(): Promise<void> {
  const baselineBuffer = await createStructureTestDocx({
    boldLimitation: true,
    feeAmount: "100000",
    includeImage: true,
    footnoteText: "Prior footnote references schedule A payment obligations.",
  });
  const counterpartyBuffer = await createStructureTestDocx({
    boldLimitation: false,
    feeAmount: "150000",
    includeImage: false,
    footnoteText: "Updated footnote references schedule A and late payment penalties.",
  });

  const baselineStructure = await extractDocxStructure(baselineBuffer, "baseline.docx");
  const counterpartyStructure = await extractDocxStructure(
    counterpartyBuffer,
    "counterparty.docx",
  );

  assert(
    "DOCX structure extractor finds tables and footnotes",
    Boolean(
      baselineStructure &&
        baselineStructure.blocks.some((block) => block.kind === "table") &&
        baselineStructure.footnotes.length === 1,
    ),
    JSON.stringify(baselineStructure),
  );

  const structural = compareDocumentStructures(
    baselineStructure,
    counterpartyStructure,
  );

  assert(
    "Structure diff detects formatting changes",
    structural.deviations.some((item) => item.kind === "formatting_change"),
    JSON.stringify(structural.deviations.map((item) => item.kind)),
  );
  assert(
    "Structure diff detects table changes",
    structural.deviations.some((item) => item.kind === "table_change"),
    JSON.stringify(structural.deviations.map((item) => item.kind)),
  );
  assert(
    "Structure diff detects image changes",
    structural.deviations.some((item) => item.kind === "image_change"),
    JSON.stringify(structural.deviations.map((item) => item.kind)),
  );
  assert(
    "Structure diff detects footnote changes",
    structural.deviations.some((item) => item.kind === "footnote_change"),
    JSON.stringify(structural.deviations.map((item) => item.kind)),
  );

  const stats = computeChangeStatistics(structural.deviations);
  assert(
    "Change statistics include structural categories",
    stats.formatting >= 1 &&
      stats.tables >= 1 &&
      stats.images >= 1 &&
      stats.footnotes >= 1,
    JSON.stringify(stats),
  );

  const baselineText = (
    await extractTextFromDocument(baselineBuffer, "baseline.docx")
  ).trim();
  const counterpartyText = (
    await extractTextFromDocument(counterpartyBuffer, "counterparty.docx")
  ).trim();
  const textComparison = compareDocumentTexts({
    baselineText,
    counterpartyText,
  });

  assert(
    "Text comparison coalesces short table cells into comparable blocks",
    textComparison.deviations.some(
      (item) =>
        item.kind === "modified" &&
        /100000|150000/.test(
          `${item.baselineExcerpt ?? ""} ${item.counterpartyExcerpt ?? ""}`,
        ),
    ),
    JSON.stringify(textComparison.deviations),
  );

  const combinedSummary = buildLegalReviewComparisonSummary([
    ...textComparison.deviations,
    ...structural.deviations,
  ]);
  assert(
    "Combined comparison summary includes structural change categories",
    combinedSummary.includes("formatting change") &&
      combinedSummary.includes("table change"),
    combinedSummary,
  );
}

async function runLegalReviewRedlineUnitTests(): Promise<void> {
  const buffer = await generateRedlineDocx({
    roundNumber: 1,
    baselineFileName: "baseline.docx",
    counterpartyFileName: "counterparty.docx",
    baselineText:
      "Limitation of liability. Each party liability shall not exceed fees paid in twelve months.",
    counterpartyText:
      "Limitation of liability. Each party liability shall not exceed two times fees paid in twelve months.",
    comparisonSummary: "1 deviation detected.",
    generatedByName: "Legal Review",
  });

  assert(
    "Redline docx generates a zip document",
    buffer.length > 500 && buffer[0] === 0x50 && buffer[1] === 0x4b,
    String(buffer.length),
  );
}

async function main(): Promise<void> {
  console.log("ContractFlow contract flow tests\n");

  runWorkflowUnitTests();
  await runWorkflowSyncUnitTests();
  runRenewalWorkflowUnitTests();
  runWorkflowPolicyUnitTests();
  runContractSearchUnitTests();
  runAttachmentStorageUnitTests();
  runAttachmentVersionUnitTests();
  runLegalReviewUnitTests();
  await runLegalReviewFixtureUnitTests();
  await runLegalReviewLiteraParityUnitTests();
  await runLegalReviewStructureUnitTests();
  await runLegalReviewRedlineUnitTests();
  await runTemplateMergeUnitTests();
  await runTemplatePersistenceTests();
  await runEmailConfigUnitTests();
  await runDatabaseIntegrationTests();

  const failed = results.filter((result) => !result.passed);
  console.log(
    `\n${results.length - failed.length}/${results.length} checks passed`,
  );

  if (failed.length > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
