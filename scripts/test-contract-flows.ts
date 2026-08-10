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
} from "@/lib/legal-assignment";
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

  let createdId: string | null = null;

  try {
    const suffix = Date.now().toString();
    const record = await createAndPersistContract(
      buildTestIntake(suffix),
      ORG_ID,
    );
    createdId = record.id;

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

    const pickedUp = await assignLegalReviewerAndPersist(
      record.id,
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
      record.id,
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
      "Approved contract removed from pending review queue",
      !pendingAfterApproval.some((contract) => contract.id === approved.id),
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
    if (createdId) {
      try {
        const { getPrismaClient } = await import("@/lib/prisma");
        const prisma = getPrismaClient();
        await prisma.contract.delete({ where: { id: createdId } });
        pass("Cleanup", `Deleted test contract ${createdId}`);
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

async function main(): Promise<void> {
  console.log("ContractFlow contract flow tests\n");

  runWorkflowUnitTests();
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
