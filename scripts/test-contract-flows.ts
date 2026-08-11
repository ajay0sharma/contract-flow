import { config } from "dotenv";
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
  matchesContractSearchTerms,
  parseContractSearchTerms,
} from "@/lib/contract-search-service";
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

async function main(): Promise<void> {
  console.log("ContractFlow contract flow tests\n");

  runWorkflowUnitTests();
  runRenewalWorkflowUnitTests();
  runWorkflowPolicyUnitTests();
  runContractSearchUnitTests();
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
