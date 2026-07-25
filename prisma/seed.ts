import { config } from "dotenv";
import { resolve } from "node:path";
import { createId } from "@paralleldrive/cuid2";
import { Prisma } from "../lib/generated/prisma/client";
import {
  ContractLifecycleStatus,
  ContractStage,
} from "../lib/generated/prisma/enums";
import type { ContractTemplateType } from "../types/contract-template";
import { getPrismaClient } from "../lib/prisma";
import { DEFAULT_ORGANIZATION_ID } from "../types/clause-library";
import type { AuditEvent, WorkflowStep, WorkflowStepStatus } from "../types/contract";

config({ path: resolve(process.cwd(), ".env.local") });
config({ path: resolve(process.cwd(), ".env") });

const ORG_ID = DEFAULT_ORGANIZATION_ID;
const LEGACY_ORG_ID = "seed-org-001";

type Requester = {
  name: string;
  email: string;
  department: string;
};

const LEGAL_APPROVER = {
  name: "Ajay Sharma",
  email: "ajay.sharma.jd@gmail.com",
};

const VP_APPROVER = {
  name: "Elena Brooks",
  email: "elena@example.com",
};

const FINANCE_APPROVER = {
  name: "Marcus Chen",
  email: "marcus@example.com",
};

const EXEC_APPROVER = {
  name: "Jordan Lee",
  email: "jordan@example.com",
};

const SYSTEM_ACTOR = {
  name: "System",
  email: "system@acme.com",
};

type AuditInput = {
  actorName: string;
  actorEmail: string;
  action: string;
  detail: string;
  daysAgo: number;
};

type SeedContractInput = {
  recordNumber: string;
  title: string;
  templateType: ContractTemplateType;
  contractTypeLabel: string;
  counterparty: string;
  contactName: string;
  contactEmail: string;
  amount: number;
  amountLabel: string;
  stage: ContractStage;
  contractStatus: ContractLifecycleStatus;
  requester: Requester;
  startDate: Date | null;
  endDate: Date | null;
  parentRecordNumber?: string;
  parentAgreementTitle?: string;
  workflowSteps: WorkflowStep[];
  currentStepIndex: number;
  auditEvents: AuditInput[];
  otherNotes?: string;
  description?: string;
  activatedAt?: Date | null;
  autoRenewal?: boolean;
  renewalNoticeDays?: number;
};

function daysAgo(n: number): Date {
  const date = new Date();
  date.setTime(date.getTime() - n * 24 * 60 * 60 * 1000);
  return date;
}

function monthsAgo(n: number): Date {
  const wholeMonths = Math.floor(n);
  const fractionalDays = (n - wholeMonths) * 30;
  const date = new Date();
  date.setMonth(date.getMonth() - wholeMonths);
  date.setTime(date.getTime() - fractionalDays * 24 * 60 * 60 * 1000);
  return date;
}

function monthsFromNow(n: number): Date {
  const wholeMonths = Math.floor(n);
  const fractionalDays = (n - wholeMonths) * 30;
  const date = new Date();
  date.setMonth(date.getMonth() + wholeMonths);
  date.setTime(date.getTime() + fractionalDays * 24 * 60 * 60 * 1000);
  return date;
}

function formatDate(value: Date | null): string | null {
  return value ? value.toISOString().slice(0, 10) : null;
}

function recordNumber(n: number): string {
  return `CR-${n.toString().padStart(6, "0")}`;
}

function buildAuditTrail(events: AuditInput[]): AuditEvent[] {
  return events.map((event, index) => ({
    id: `audit-seed-${index}-${createId()}`,
    timestamp: daysAgo(event.daysAgo).toISOString(),
    actorName: event.actorName,
    actorEmail: event.actorEmail,
    action: event.action,
    detail: event.detail,
  }));
}

function stepAssignee(stepId: string): { name: string; email: string; role: string } {
  switch (stepId) {
    case "legal":
      return { ...LEGAL_APPROVER, role: "Legal" };
    case "department-vp":
      return { ...VP_APPROVER, role: "VP" };
    case "finance":
      return { ...FINANCE_APPROVER, role: "Finance" };
    case "executive":
      return { ...EXEC_APPROVER, role: "Executive" };
    default:
      return { ...LEGAL_APPROVER, role: "Reviewer" };
  }
}

function stepName(stepId: string): string {
  switch (stepId) {
    case "legal":
      return "Legal Review";
    case "department-vp":
      return "VP Review";
    case "finance":
      return "Finance Review";
    case "executive":
      return "Executive Sign-off";
    default:
      return stepId;
  }
}

function stepStage(stepId: string): ContractStage {
  switch (stepId) {
    case "legal":
      return "legal_review";
    case "department-vp":
      return "vp_review";
    case "finance":
      return "finance_review";
    case "executive":
      return "executive_signoff";
    default:
      return "legal_review";
  }
}

function includedStepIds(amount: number): string[] {
  const steps = ["legal", "department-vp"];

  if (amount >= 50_000) {
    steps.push("finance");
  }

  if (amount >= 250_000) {
    steps.push("executive");
  }

  return steps;
}

function buildWorkflowSteps(
  stage: ContractStage,
  amount: number,
  notes: Partial<Record<string, string>> = {},
  completedDaysAgo: Partial<Record<string, number>> = {},
): { steps: WorkflowStep[]; currentStepIndex: number } {
  const stepIds = includedStepIds(amount);
  const terminalCompleteStages: ContractStage[] = [
    "awaiting_signature",
    "active",
    "expired",
  ];
  const allCompleted = terminalCompleteStages.includes(stage);
  const currentStage = allCompleted ? null : stage;

  const steps: WorkflowStep[] = stepIds.map((stepId) => {
    const assignee = stepAssignee(stepId);
    let status: WorkflowStepStatus = "upcoming";

    if (allCompleted) {
      status = "completed";
    } else if (stage === "request") {
      status = "upcoming";
    } else if (stage === "rejected") {
      status = "upcoming";
    } else if (currentStage === stepStage(stepId)) {
      status = "current";
    } else {
      const currentIndex = stepIds.findIndex(
        (id) => stepStage(id) === currentStage,
      );
      const stepIndex = stepIds.indexOf(stepId);

      if (currentIndex === -1) {
        status = "upcoming";
      } else if (stepIndex < currentIndex) {
        status = "completed";
      } else {
        status = "upcoming";
      }
    }

    const completedAtDays = completedDaysAgo[stepId];
    const completedAt =
      status === "completed" && completedAtDays !== undefined
        ? daysAgo(completedAtDays).toISOString()
        : undefined;

    return {
      id: stepId,
      name: stepName(stepId),
      role: assignee.role,
      assigneeEmail: assignee.email,
      assigneeName: assignee.name,
      status,
      completedAt,
      note: notes[stepId],
    };
  });

  if (stage === "rejected") {
    const rejectedIndex = steps.findIndex((step) => step.status === "current");

    if (rejectedIndex === -1 && steps.length > 0) {
      const vpIndex = steps.findIndex((step) => step.id === "department-vp");
      const rejectIndex = vpIndex >= 0 ? vpIndex : steps.length - 1;
      steps.forEach((step, index) => {
        if (index < rejectIndex) {
          step.status = "completed";
        } else if (index === rejectIndex) {
          step.status = "rejected";
        } else {
          step.status = "upcoming";
        }
      });
    }
  }

  const currentStepIndex = allCompleted
    ? Math.max(steps.length - 1, 0)
    : Math.max(
        steps.findIndex((step) => step.status === "current"),
        steps.findIndex((step) => step.status === "rejected"),
        0,
      );

  return { steps, currentStepIndex };
}

function buildExplicitWorkflowSteps(
  configs: Array<{
    id: string;
    status: WorkflowStepStatus;
    note?: string;
    completedDaysAgo?: number;
  }>,
): { steps: WorkflowStep[]; currentStepIndex: number } {
  const steps = configs.map((config) => {
    const assignee = stepAssignee(config.id);

    return {
      id: config.id,
      name: stepName(config.id),
      role: assignee.role,
      assigneeEmail: assignee.email,
      assigneeName: assignee.name,
      status: config.status,
      completedAt:
        config.status === "completed" && config.completedDaysAgo !== undefined
          ? daysAgo(config.completedDaysAgo).toISOString()
          : undefined,
      note: config.note,
    };
  });

  const currentStepIndex = Math.max(
    steps.findIndex((step) => step.status === "current"),
    steps.findIndex((step) => step.status === "rejected"),
    steps.length > 0 ? 0 : 0,
  );

  return { steps, currentStepIndex };
}

function buildSeedContracts(): SeedContractInput[] {
  const sarah: Requester = {
    name: "Sarah Chen",
    email: "marcus@example.com",
    department: "Engineering",
  };
  const marcus: Requester = {
    name: "Marcus Williams",
    email: "marcus@example.com",
    department: "Finance",
  };
  const priya: Requester = {
    name: "Priya Patel",
    email: "elena@example.com",
    department: "Operations",
  };
  const james: Requester = {
    name: "James O'Brien",
    email: "jordan@example.com",
    department: "Sales",
  };
  const diana: Requester = {
    name: "Diana Torres",
    email: "jordan@example.com",
    department: "HR",
  };

  const cr1Workflow = buildWorkflowSteps("active", 450_000, {
    legal:
      "Standard MSA terms reviewed and approved. IP clauses negotiated.",
    "department-vp": "Approved. Strategic vendor.",
    finance: "Budget confirmed and allocated.",
    executive: "Approved for execution.",
  }, {
    legal: 19 * 30 + 15,
    "department-vp": 18.5 * 30,
    finance: 18.2 * 30,
    executive: 18.1 * 30,
  });

  const cr2Workflow = buildWorkflowSteps("active", 85_000, {
    legal: "Consistent with MSA terms.",
    finance: "Within project budget.",
  }, {
    legal: 16.5 * 30,
    "department-vp": 16.2 * 30,
    finance: 16.1 * 30,
  });

  const cr3Workflow = buildExplicitWorkflowSteps([
    {
      id: "legal",
      status: "completed",
      completedDaysAgo: 8,
      note: "Reviewed against MSA. Additional IP clause added for data migration work.",
    },
    {
      id: "department-vp",
      status: "completed",
      completedDaysAgo: 5,
      note: "Approved. Continuation of existing engagement.",
    },
    {
      id: "finance",
      status: "current",
    },
    {
      id: "executive",
      status: "upcoming",
    },
  ]);

  const cr4Workflow = buildWorkflowSteps("legal_review", 0);

  const cr5Workflow = buildWorkflowSteps("active", 0, {
    legal: "Standard mutual NDA. 2 year term.",
  }, {
    legal: 8.2 * 30,
    "department-vp": 8.1 * 30,
  });

  const cr6Workflow = buildWorkflowSteps("active", 180_000, {
    legal: "MSA follows executed NDA CR-000005. Terms negotiated over 3 rounds.",
  }, {
    legal: 6.5 * 30,
    "department-vp": 6.2 * 30,
    finance: 6.1 * 30,
  });

  const cr7Workflow = buildWorkflowSteps("awaiting_signature", 65_000, {
    legal: "Within MSA scope. Deliverables well defined.",
  }, {
    legal: 20,
    "department-vp": 16,
    finance: 14,
  });

  const cr8Workflow = buildWorkflowSteps("vp_review", 18_500, {
    legal: "Change order is within MSA scope. Minor scope addition approved.",
  }, {
    legal: 4,
  });

  const cr9Workflow = buildWorkflowSteps("active", 165_000, {
    legal:
      "Standard employment agreement. IP assignment and non-compete reviewed.",
    finance: "Compensation within approved band.",
  }, {
    legal: 4.5 * 30,
    "department-vp": 4.2 * 30,
    finance: 4.1 * 30,
  });

  const cr10Workflow = buildWorkflowSteps("legal_review", 210_000);

  const cr11Workflow = buildWorkflowSteps("active", 48_000, {
    legal: "Standard SaaS terms. Data processing addendum included.",
  }, {
    legal: 11.5 * 30,
    "department-vp": 11.2 * 30,
  });

  const cr12Workflow = buildWorkflowSteps("request", 12_000);

  const cr13Workflow = buildExplicitWorkflowSteps([
    {
      id: "legal",
      status: "completed",
      completedDaysAgo: 40,
      note: "Reviewed. Data residency clauses are problematic — data stored in non-compliant jurisdictions.",
    },
    {
      id: "department-vp",
      status: "rejected",
      completedDaysAgo: 38,
      note: "Cannot approve given legal concerns about data residency. Vendor must provide EU data processing option before we can proceed.",
    },
    {
      id: "finance",
      status: "upcoming",
    },
  ]);

  const cr14Workflow = buildWorkflowSteps("active", 0, {
    legal: "Revenue share terms reviewed. IP ownership clauses added.",
  }, {
    legal: 14.5 * 30,
    "department-vp": 14.2 * 30,
  });

  const cr15Workflow = buildWorkflowSteps("active", 0, {}, {
    legal: 9.5 * 30,
    "department-vp": 9.2 * 30,
  });

  const cr16Workflow = buildExplicitWorkflowSteps([
    {
      id: "legal",
      status: "completed",
      completedDaysAgo: 12,
      note: "Revenue share revision reviewed. New formula is more favorable. Updated exhibit attached.",
    },
    {
      id: "department-vp",
      status: "completed",
      completedDaysAgo: 8,
      note: "Agreed. Revised terms improve our margin by approximately 3 percent.",
    },
    {
      id: "finance",
      status: "completed",
      completedDaysAgo: 5,
      note: "Modeled impact. Approve the revision.",
    },
    {
      id: "executive",
      status: "current",
    },
  ]);

  const cr17Workflow = buildWorkflowSteps("active", 75_000, {}, {
    legal: 7.5 * 30,
    "department-vp": 7.2 * 30,
    finance: 7.1 * 30,
  });

  const cr18Workflow = buildWorkflowSteps("active", 35_000, {}, {
    legal: 6.5 * 30,
    "department-vp": 6.2 * 30,
  });

  const cr19Workflow = buildExplicitWorkflowSteps([
    {
      id: "legal",
      status: "completed",
      completedDaysAgo: 2.8 * 30,
      note: "Change order reviewed. Within consulting agreement scope.",
    },
    {
      id: "department-vp",
      status: "rejected",
      completedDaysAgo: 2.5 * 30,
      note: "Phase 1 deliverables did not meet expectations. Will not extend engagement at this time.",
    },
  ]);

  return [
    {
      recordNumber: recordNumber(1),
      title: "Master Services Agreement — Apex Technology Solutions",
      templateType: "vendor",
      contractTypeLabel: "Master Services Agreement",
      counterparty: "Apex Technology Solutions",
      contactName: "Robert Hawkins",
      contactEmail: "robert.hawkins@apextech.com",
      amount: 450_000,
      amountLabel: "$450,000 annually",
      stage: "active",
      contractStatus: "active",
      requester: sarah,
      startDate: monthsAgo(18),
      endDate: monthsFromNow(6),
      workflowSteps: cr1Workflow.steps,
      currentStepIndex: cr1Workflow.currentStepIndex,
      activatedAt: monthsAgo(18),
      auditEvents: [
        {
          actorName: sarah.name,
          actorEmail: sarah.email,
          action: "Submitted contract",
          detail: "Submitted Master Services Agreement for Apex Technology Solutions.",
          daysAgo: 19 * 30,
        },
        {
          actorName: LEGAL_APPROVER.name,
          actorEmail: LEGAL_APPROVER.email,
          action: "Approved",
          detail:
            "Standard MSA terms reviewed and approved. IP clauses negotiated.",
          daysAgo: 18.5 * 30,
        },
        {
          actorName: VP_APPROVER.name,
          actorEmail: VP_APPROVER.email,
          action: "Approved",
          detail: "Approved. Strategic vendor.",
          daysAgo: 18.2 * 30,
        },
        {
          actorName: FINANCE_APPROVER.name,
          actorEmail: FINANCE_APPROVER.email,
          action: "Approved",
          detail: "Budget confirmed and allocated.",
          daysAgo: 18.1 * 30,
        },
        {
          actorName: EXEC_APPROVER.name,
          actorEmail: EXEC_APPROVER.email,
          action: "Approved",
          detail: "Approved for execution.",
          daysAgo: 18.05 * 30,
        },
        {
          actorName: SYSTEM_ACTOR.name,
          actorEmail: SYSTEM_ACTOR.email,
          action: "Marked active",
          detail: "Contract marked active after all approvals were completed.",
          daysAgo: 18 * 30,
        },
      ],
    },
    {
      recordNumber: recordNumber(2),
      title: "SOW #1 — Platform Integration Services — Apex Technology Solutions",
      templateType: "customer",
      contractTypeLabel: "Statement of Work",
      counterparty: "Apex Technology Solutions",
      contactName: "Robert Hawkins",
      contactEmail: "robert.hawkins@apextech.com",
      amount: 85_000,
      amountLabel: "$85,000",
      stage: "active",
      contractStatus: "active",
      requester: sarah,
      startDate: monthsAgo(16),
      endDate: monthsAgo(10),
      parentRecordNumber: recordNumber(1),
      parentAgreementTitle:
        "Master Services Agreement — Apex Technology Solutions",
      workflowSteps: cr2Workflow.steps,
      currentStepIndex: cr2Workflow.currentStepIndex,
      activatedAt: monthsAgo(16),
      auditEvents: [
        {
          actorName: sarah.name,
          actorEmail: sarah.email,
          action: "Submitted contract",
          detail: "SOW under MSA CR-000001",
          daysAgo: 17 * 30,
        },
        {
          actorName: LEGAL_APPROVER.name,
          actorEmail: LEGAL_APPROVER.email,
          action: "Approved",
          detail: "Consistent with MSA terms.",
          daysAgo: 16.5 * 30,
        },
        {
          actorName: VP_APPROVER.name,
          actorEmail: VP_APPROVER.email,
          action: "Approved",
          detail: "Approved by VP review.",
          daysAgo: 16.2 * 30,
        },
        {
          actorName: FINANCE_APPROVER.name,
          actorEmail: FINANCE_APPROVER.email,
          action: "Approved",
          detail: "Within project budget.",
          daysAgo: 16.1 * 30,
        },
        {
          actorName: SYSTEM_ACTOR.name,
          actorEmail: SYSTEM_ACTOR.email,
          action: "Marked active",
          detail: "Contract marked active.",
          daysAgo: 16 * 30,
        },
      ],
    },
    {
      recordNumber: recordNumber(3),
      title:
        "SOW #2 — Data Migration and Cloud Infrastructure — Apex Technology Solutions",
      templateType: "consulting",
      contractTypeLabel: "Statement of Work",
      counterparty: "Apex Technology Solutions",
      contactName: "Robert Hawkins",
      contactEmail: "robert.hawkins@apextech.com",
      amount: 120_000,
      amountLabel: "$120,000",
      stage: "finance_review",
      contractStatus: "pending",
      requester: sarah,
      startDate: monthsFromNow(2),
      endDate: monthsFromNow(8),
      parentRecordNumber: recordNumber(1),
      parentAgreementTitle:
        "Master Services Agreement — Apex Technology Solutions",
      workflowSteps: cr3Workflow.steps,
      currentStepIndex: cr3Workflow.currentStepIndex,
      auditEvents: [
        {
          actorName: sarah.name,
          actorEmail: sarah.email,
          action: "Submitted contract",
          detail: "Submitted SOW #2 under MSA CR-000001.",
          daysAgo: 15,
        },
        {
          actorName: LEGAL_APPROVER.name,
          actorEmail: LEGAL_APPROVER.email,
          action: "Approved",
          detail: "Legal review completed for SOW #2.",
          daysAgo: 8,
        },
        {
          actorName: VP_APPROVER.name,
          actorEmail: VP_APPROVER.email,
          action: "Approved",
          detail: "VP review completed for SOW #2.",
          daysAgo: 5,
        },
        {
          actorName: FINANCE_APPROVER.name,
          actorEmail: FINANCE_APPROVER.email,
          action: "Pending review",
          detail: "Waiting on Chris Okafor for Finance Review.",
          daysAgo: 0,
        },
      ],
    },
    {
      recordNumber: recordNumber(4),
      title:
        "Amendment #1 to MSA — Apex Technology Solutions — Extended Term and Revised Pricing",
      templateType: "vendor",
      contractTypeLabel: "Amendment",
      counterparty: "Apex Technology Solutions",
      contactName: "Robert Hawkins",
      contactEmail: "robert.hawkins@apextech.com",
      amount: 0,
      amountLabel: "$0",
      stage: "legal_review",
      contractStatus: "pending",
      requester: sarah,
      startDate: monthsFromNow(1),
      endDate: monthsFromNow(6),
      parentRecordNumber: recordNumber(1),
      parentAgreementTitle:
        "Master Services Agreement — Apex Technology Solutions",
      workflowSteps: cr4Workflow.steps,
      currentStepIndex: cr4Workflow.currentStepIndex,
      auditEvents: [
        {
          actorName: sarah.name,
          actorEmail: sarah.email,
          action: "Submitted contract",
          detail:
            "Amendment to extend MSA term by 2 years and revise annual fee schedule. Linked to CR-000001.",
          daysAgo: 3,
        },
        {
          actorName: LEGAL_APPROVER.name,
          actorEmail: LEGAL_APPROVER.email,
          action: "Pending review",
          detail: "Waiting on Legal Team.",
          daysAgo: 0,
        },
      ],
    },
    {
      recordNumber: recordNumber(5),
      title: "Mutual NDA — Brightside Analytics Inc",
      templateType: "nda",
      contractTypeLabel: "Non-Disclosure Agreement",
      counterparty: "Brightside Analytics Inc",
      contactName: "Michelle Park",
      contactEmail: "michelle.park@brightsideanalytics.com",
      amount: 0,
      amountLabel: "$0",
      stage: "active",
      contractStatus: "active",
      requester: james,
      startDate: monthsAgo(8),
      endDate: monthsFromNow(24),
      workflowSteps: cr5Workflow.steps,
      currentStepIndex: cr5Workflow.currentStepIndex,
      activatedAt: monthsAgo(8),
      auditEvents: [
        {
          actorName: james.name,
          actorEmail: james.email,
          action: "Submitted contract",
          detail:
            "NDA required before sharing product roadmap in sales discussions.",
          daysAgo: 8.5 * 30,
        },
        {
          actorName: LEGAL_APPROVER.name,
          actorEmail: LEGAL_APPROVER.email,
          action: "Approved",
          detail: "Standard mutual NDA. 2 year term.",
          daysAgo: 8.2 * 30,
        },
        {
          actorName: VP_APPROVER.name,
          actorEmail: VP_APPROVER.email,
          action: "Approved",
          detail: "Approved by VP review.",
          daysAgo: 8.1 * 30,
        },
        {
          actorName: SYSTEM_ACTOR.name,
          actorEmail: SYSTEM_ACTOR.email,
          action: "Marked active",
          detail: "Contract marked active.",
          daysAgo: 8 * 30,
        },
      ],
    },
    {
      recordNumber: recordNumber(6),
      title: "Master Services Agreement — Brightside Analytics Inc",
      templateType: "vendor",
      contractTypeLabel: "Master Services Agreement",
      counterparty: "Brightside Analytics Inc",
      contactName: "Michelle Park",
      contactEmail: "michelle.park@brightsideanalytics.com",
      amount: 180_000,
      amountLabel: "$180,000 annually",
      stage: "active",
      contractStatus: "active",
      requester: james,
      startDate: monthsAgo(6),
      endDate: monthsFromNow(18),
      parentRecordNumber: recordNumber(5),
      parentAgreementTitle: "Mutual NDA — Brightside Analytics Inc",
      otherNotes:
        "Linked to executed NDA CR-000005 as the preceding agreement that enabled the relationship.",
      workflowSteps: cr6Workflow.steps,
      currentStepIndex: cr6Workflow.currentStepIndex,
      activatedAt: monthsAgo(6),
      auditEvents: [
        {
          actorName: james.name,
          actorEmail: james.email,
          action: "Submitted contract",
          detail: "Submitted MSA following executed NDA CR-000005.",
          daysAgo: 7 * 30,
        },
        {
          actorName: LEGAL_APPROVER.name,
          actorEmail: LEGAL_APPROVER.email,
          action: "Approved",
          detail:
            "MSA follows executed NDA CR-000005. Terms negotiated over 3 rounds.",
          daysAgo: 6.5 * 30,
        },
        {
          actorName: VP_APPROVER.name,
          actorEmail: VP_APPROVER.email,
          action: "Approved",
          detail: "Approved by VP review.",
          daysAgo: 6.2 * 30,
        },
        {
          actorName: FINANCE_APPROVER.name,
          actorEmail: FINANCE_APPROVER.email,
          action: "Approved",
          detail: "Finance review completed.",
          daysAgo: 6.1 * 30,
        },
        {
          actorName: SYSTEM_ACTOR.name,
          actorEmail: SYSTEM_ACTOR.email,
          action: "Marked active",
          detail: "Contract marked active.",
          daysAgo: 6 * 30,
        },
      ],
    },
    {
      recordNumber: recordNumber(7),
      title:
        "SOW #1 — Business Intelligence Dashboard Implementation — Brightside Analytics Inc",
      templateType: "consulting",
      contractTypeLabel: "Statement of Work",
      counterparty: "Brightside Analytics Inc",
      contactName: "Michelle Park",
      contactEmail: "michelle.park@brightsideanalytics.com",
      amount: 65_000,
      amountLabel: "$65,000",
      stage: "awaiting_signature",
      contractStatus: "pending",
      requester: james,
      startDate: monthsFromNow(1),
      endDate: monthsFromNow(5),
      parentRecordNumber: recordNumber(6),
      parentAgreementTitle:
        "Master Services Agreement — Brightside Analytics Inc",
      workflowSteps: cr7Workflow.steps,
      currentStepIndex: cr7Workflow.currentStepIndex,
      auditEvents: [
        {
          actorName: james.name,
          actorEmail: james.email,
          action: "Submitted contract",
          detail: "Submitted SOW #1 under Brightside MSA CR-000006.",
          daysAgo: 25,
        },
        {
          actorName: LEGAL_APPROVER.name,
          actorEmail: LEGAL_APPROVER.email,
          action: "Approved",
          detail: "Within MSA scope. Deliverables well defined.",
          daysAgo: 20,
        },
        {
          actorName: VP_APPROVER.name,
          actorEmail: VP_APPROVER.email,
          action: "Approved",
          detail: "Approved by VP review.",
          daysAgo: 16,
        },
        {
          actorName: FINANCE_APPROVER.name,
          actorEmail: FINANCE_APPROVER.email,
          action: "Approved",
          detail: "Finance review completed.",
          daysAgo: 14,
        },
        {
          actorName: SYSTEM_ACTOR.name,
          actorEmail: SYSTEM_ACTOR.email,
          action: "Moved to awaiting signature",
          detail:
            "All approvals complete. Sent to Brightside for countersignature.",
          daysAgo: 14,
        },
      ],
    },
    {
      recordNumber: recordNumber(8),
      title:
        "Change Order #1 — SOW #1 — Additional Reporting Module — Brightside Analytics Inc",
      templateType: "consulting",
      contractTypeLabel: "Change Order",
      counterparty: "Brightside Analytics Inc",
      contactName: "Michelle Park",
      contactEmail: "michelle.park@brightsideanalytics.com",
      amount: 18_500,
      amountLabel: "$18,500",
      stage: "vp_review",
      contractStatus: "pending",
      requester: james,
      startDate: monthsFromNow(1),
      endDate: monthsFromNow(5.75),
      parentRecordNumber: recordNumber(7),
      parentAgreementTitle:
        "SOW #1 — Business Intelligence Dashboard Implementation — Brightside Analytics Inc",
      workflowSteps: cr8Workflow.steps,
      currentStepIndex: cr8Workflow.currentStepIndex,
      auditEvents: [
        {
          actorName: james.name,
          actorEmail: james.email,
          action: "Submitted contract",
          detail:
            "Change order to add custom reporting module. Additional 3 weeks of work. Linked to SOW CR-000007.",
          daysAgo: 7,
        },
        {
          actorName: LEGAL_APPROVER.name,
          actorEmail: LEGAL_APPROVER.email,
          action: "Approved",
          detail: "Legal review completed for change order.",
          daysAgo: 4,
        },
        {
          actorName: VP_APPROVER.name,
          actorEmail: VP_APPROVER.email,
          action: "Pending review",
          detail: "Waiting on VP review.",
          daysAgo: 0,
        },
      ],
    },
    {
      recordNumber: recordNumber(9),
      title: "Employment Agreement — Senior Software Engineer — Kenji Watanabe",
      templateType: "employment",
      contractTypeLabel: "Employment Agreement",
      counterparty: "Kenji Watanabe (Individual)",
      contactName: "Kenji Watanabe",
      contactEmail: "kenji.watanabe@candidate.com",
      amount: 165_000,
      amountLabel: "$165,000 annual salary",
      stage: "active",
      contractStatus: "active",
      requester: diana,
      startDate: monthsAgo(4),
      endDate: null,
      workflowSteps: cr9Workflow.steps,
      currentStepIndex: cr9Workflow.currentStepIndex,
      activatedAt: monthsAgo(4),
      auditEvents: [
        {
          actorName: diana.name,
          actorEmail: diana.email,
          action: "Submitted contract",
          detail: "Submitted employment agreement for Kenji Watanabe.",
          daysAgo: 5 * 30,
        },
        {
          actorName: LEGAL_APPROVER.name,
          actorEmail: LEGAL_APPROVER.email,
          action: "Approved",
          detail:
            "Standard employment agreement. IP assignment and non-compete reviewed.",
          daysAgo: 4.5 * 30,
        },
        {
          actorName: VP_APPROVER.name,
          actorEmail: VP_APPROVER.email,
          action: "Approved",
          detail: "Approved by VP review.",
          daysAgo: 4.2 * 30,
        },
        {
          actorName: FINANCE_APPROVER.name,
          actorEmail: FINANCE_APPROVER.email,
          action: "Approved",
          detail: "Compensation within approved band.",
          daysAgo: 4.1 * 30,
        },
        {
          actorName: SYSTEM_ACTOR.name,
          actorEmail: SYSTEM_ACTOR.email,
          action: "Marked active",
          detail: "Contract marked active.",
          daysAgo: 4 * 30,
        },
      ],
    },
    {
      recordNumber: recordNumber(10),
      title: "Employment Agreement — Head of Product — Amara Osei",
      templateType: "employment",
      contractTypeLabel: "Employment Agreement",
      counterparty: "Amara Osei (Individual)",
      contactName: "Amara Osei",
      contactEmail: "amara.osei@candidate.com",
      amount: 210_000,
      amountLabel: "$210,000 annual salary",
      stage: "legal_review",
      contractStatus: "pending",
      requester: diana,
      startDate: daysAgo(-21),
      endDate: null,
      workflowSteps: cr10Workflow.steps,
      currentStepIndex: cr10Workflow.currentStepIndex,
      auditEvents: [
        {
          actorName: diana.name,
          actorEmail: diana.email,
          action: "Submitted contract",
          detail:
            "Offer accepted. Start date in 3 weeks. Compensation approved by CEO verbally — finance to confirm budget allocation.",
          daysAgo: 2,
        },
        {
          actorName: LEGAL_APPROVER.name,
          actorEmail: LEGAL_APPROVER.email,
          action: "Pending review",
          detail: "Waiting on Legal Team.",
          daysAgo: 0,
        },
      ],
    },
    {
      recordNumber: recordNumber(11),
      title: "SaaS Subscription Agreement — DataVault Pro — Enterprise Plan",
      templateType: "saas",
      contractTypeLabel: "SaaS Agreement",
      counterparty: "DataVault Technologies Ltd",
      contactName: "Sam Nguyen",
      contactEmail: "sam.nguyen@datavaultpro.com",
      amount: 48_000,
      amountLabel: "$48,000 annually",
      stage: "active",
      contractStatus: "active",
      requester: marcus,
      startDate: monthsAgo(11),
      endDate: monthsFromNow(1),
      autoRenewal: true,
      renewalNoticeDays: 30,
      description:
        "Enterprise SaaS subscription approaching renewal — end date is very soon.",
      workflowSteps: cr11Workflow.steps,
      currentStepIndex: cr11Workflow.currentStepIndex,
      activatedAt: monthsAgo(11),
      auditEvents: [
        {
          actorName: marcus.name,
          actorEmail: marcus.email,
          action: "Submitted contract",
          detail: "Submitted SaaS subscription agreement for DataVault Pro.",
          daysAgo: 12 * 30,
        },
        {
          actorName: LEGAL_APPROVER.name,
          actorEmail: LEGAL_APPROVER.email,
          action: "Approved",
          detail: "Standard SaaS terms. Data processing addendum included.",
          daysAgo: 11.5 * 30,
        },
        {
          actorName: VP_APPROVER.name,
          actorEmail: VP_APPROVER.email,
          action: "Approved",
          detail: "Approved by VP review.",
          daysAgo: 11.2 * 30,
        },
        {
          actorName: SYSTEM_ACTOR.name,
          actorEmail: SYSTEM_ACTOR.email,
          action: "Marked active",
          detail: "Contract marked active.",
          daysAgo: 11 * 30,
        },
      ],
    },
    {
      recordNumber: recordNumber(12),
      title: "Amendment #1 — DataVault Pro — Additional User Seats and Storage",
      templateType: "saas",
      contractTypeLabel: "Amendment",
      counterparty: "DataVault Technologies Ltd",
      contactName: "Sam Nguyen",
      contactEmail: "sam.nguyen@datavaultpro.com",
      amount: 12_000,
      amountLabel: "$12,000 additional annually",
      stage: "request",
      contractStatus: "draft",
      requester: marcus,
      startDate: monthsFromNow(1),
      endDate: monthsFromNow(13),
      parentRecordNumber: recordNumber(11),
      parentAgreementTitle:
        "SaaS Subscription Agreement — DataVault Pro — Enterprise Plan",
      workflowSteps: cr12Workflow.steps,
      currentStepIndex: cr12Workflow.currentStepIndex,
      auditEvents: [
        {
          actorName: marcus.name,
          actorEmail: marcus.email,
          action: "Submitted contract",
          detail:
            "Amendment to add 15 user seats and 2TB additional storage ahead of contract renewal. Linked to CR-000011 which renews in approximately 1 month.",
          daysAgo: 0,
        },
      ],
    },
    {
      recordNumber: recordNumber(13),
      title: "Software License Agreement — Nexus AI Platform — Professional Plan",
      templateType: "saas",
      contractTypeLabel: "Software License Agreement",
      counterparty: "Nexus AI Corp",
      contactName: "Tyler Brooks",
      contactEmail: "tyler.brooks@nexusai.com",
      amount: 95_000,
      amountLabel: "$95,000 annually",
      stage: "rejected",
      contractStatus: "rejected",
      requester: priya,
      startDate: null,
      endDate: null,
      description: "AI platform for operations workflow automation.",
      workflowSteps: cr13Workflow.steps,
      currentStepIndex: cr13Workflow.currentStepIndex,
      auditEvents: [
        {
          actorName: priya.name,
          actorEmail: priya.email,
          action: "Submitted contract",
          detail: "AI platform for operations workflow automation.",
          daysAgo: 45,
        },
        {
          actorName: LEGAL_APPROVER.name,
          actorEmail: LEGAL_APPROVER.email,
          action: "Approved with concerns",
          detail: "Reviewed with data residency concerns noted.",
          daysAgo: 40,
        },
        {
          actorName: VP_APPROVER.name,
          actorEmail: VP_APPROVER.email,
          action: "Rejected",
          detail:
            "Data residency non-compliant. Rejected pending vendor remediation.",
          daysAgo: 38,
        },
      ],
    },
    {
      recordNumber: recordNumber(14),
      title: "Strategic Partnership Agreement — CloudBridge Networks",
      templateType: "partnership",
      contractTypeLabel: "Partnership Agreement",
      counterparty: "CloudBridge Networks Inc",
      contactName: "Elena Vasquez",
      contactEmail: "elena.vasquez@cloudbridgenetworks.com",
      amount: 0,
      amountLabel: "$0",
      stage: "active",
      contractStatus: "active",
      requester: james,
      startDate: monthsAgo(14),
      endDate: monthsFromNow(10),
      description: "Revenue share partnership with no fixed fee.",
      workflowSteps: cr14Workflow.steps,
      currentStepIndex: cr14Workflow.currentStepIndex,
      activatedAt: monthsAgo(14),
      auditEvents: [
        {
          actorName: james.name,
          actorEmail: james.email,
          action: "Submitted contract",
          detail: "Submitted strategic partnership agreement.",
          daysAgo: 15 * 30,
        },
        {
          actorName: LEGAL_APPROVER.name,
          actorEmail: LEGAL_APPROVER.email,
          action: "Approved",
          detail: "Revenue share terms reviewed. IP ownership clauses added.",
          daysAgo: 14.5 * 30,
        },
        {
          actorName: VP_APPROVER.name,
          actorEmail: VP_APPROVER.email,
          action: "Approved",
          detail: "Approved by VP review.",
          daysAgo: 14.2 * 30,
        },
        {
          actorName: SYSTEM_ACTOR.name,
          actorEmail: SYSTEM_ACTOR.email,
          action: "Marked active",
          detail: "Contract marked active.",
          daysAgo: 14 * 30,
        },
      ],
    },
    {
      recordNumber: recordNumber(15),
      title:
        "Amendment #1 — CloudBridge Networks Partnership — Expanded Territory Rights",
      templateType: "partnership",
      contractTypeLabel: "Amendment",
      counterparty: "CloudBridge Networks Inc",
      contactName: "Elena Vasquez",
      contactEmail: "elena.vasquez@cloudbridgenetworks.com",
      amount: 0,
      amountLabel: "$0",
      stage: "active",
      contractStatus: "active",
      requester: james,
      startDate: monthsAgo(9),
      endDate: monthsFromNow(10),
      parentRecordNumber: recordNumber(14),
      parentAgreementTitle: "Strategic Partnership Agreement — CloudBridge Networks",
      workflowSteps: cr15Workflow.steps,
      currentStepIndex: cr15Workflow.currentStepIndex,
      activatedAt: monthsAgo(9),
      auditEvents: [
        {
          actorName: james.name,
          actorEmail: james.email,
          action: "Submitted contract",
          detail: "Expanding territory rights to include APAC region.",
          daysAgo: 10 * 30,
        },
        {
          actorName: LEGAL_APPROVER.name,
          actorEmail: LEGAL_APPROVER.email,
          action: "Approved",
          detail: "Legal review completed for territory amendment.",
          daysAgo: 9.5 * 30,
        },
        {
          actorName: VP_APPROVER.name,
          actorEmail: VP_APPROVER.email,
          action: "Approved",
          detail: "Approved by VP review.",
          daysAgo: 9.2 * 30,
        },
        {
          actorName: SYSTEM_ACTOR.name,
          actorEmail: SYSTEM_ACTOR.email,
          action: "Marked active",
          detail: "Contract marked active.",
          daysAgo: 9 * 30,
        },
      ],
    },
    {
      recordNumber: recordNumber(16),
      title:
        "Amendment #2 — CloudBridge Networks Partnership — Revised Revenue Share Formula",
      templateType: "partnership",
      contractTypeLabel: "Amendment",
      counterparty: "CloudBridge Networks Inc",
      contactName: "Elena Vasquez",
      contactEmail: "elena.vasquez@cloudbridgenetworks.com",
      amount: 0,
      amountLabel: "$0",
      stage: "executive_signoff",
      contractStatus: "pending",
      requester: james,
      startDate: null,
      endDate: null,
      parentRecordNumber: recordNumber(14),
      parentAgreementTitle: "Strategic Partnership Agreement — CloudBridge Networks",
      workflowSteps: cr16Workflow.steps,
      currentStepIndex: cr16Workflow.currentStepIndex,
      auditEvents: [
        {
          actorName: james.name,
          actorEmail: james.email,
          action: "Submitted contract",
          detail:
            "Amendment to revise revenue share from 15% to 18% with quarterly reconciliation. Linked to CR-000014.",
          daysAgo: 20,
        },
        {
          actorName: LEGAL_APPROVER.name,
          actorEmail: LEGAL_APPROVER.email,
          action: "Approved",
          detail: "Legal review completed for revenue share revision.",
          daysAgo: 12,
        },
        {
          actorName: VP_APPROVER.name,
          actorEmail: VP_APPROVER.email,
          action: "Approved",
          detail: "VP review completed.",
          daysAgo: 8,
        },
        {
          actorName: FINANCE_APPROVER.name,
          actorEmail: FINANCE_APPROVER.email,
          action: "Approved",
          detail: "Finance review completed.",
          daysAgo: 5,
        },
        {
          actorName: EXEC_APPROVER.name,
          actorEmail: EXEC_APPROVER.email,
          action: "Pending review",
          detail: "Waiting on Jordan Lee for Executive Sign-off.",
          daysAgo: 0,
        },
      ],
    },
    {
      recordNumber: recordNumber(17),
      title: "Consulting Agreement — Meridian Strategy Group",
      templateType: "consulting",
      contractTypeLabel: "Consulting Agreement",
      counterparty: "Meridian Strategy Group LLC",
      contactName: "Patricia Okonkwo",
      contactEmail: "p.okonkwo@meridianstrategy.com",
      amount: 75_000,
      amountLabel: "$75,000",
      stage: "active",
      contractStatus: "active",
      requester: priya,
      startDate: monthsAgo(7),
      endDate: monthsFromNow(5),
      workflowSteps: cr17Workflow.steps,
      currentStepIndex: cr17Workflow.currentStepIndex,
      activatedAt: monthsAgo(7),
      auditEvents: [
        {
          actorName: priya.name,
          actorEmail: priya.email,
          action: "Submitted contract",
          detail: "Submitted consulting agreement with Meridian Strategy Group.",
          daysAgo: 8 * 30,
        },
        {
          actorName: LEGAL_APPROVER.name,
          actorEmail: LEGAL_APPROVER.email,
          action: "Approved",
          detail: "Legal review completed.",
          daysAgo: 7.5 * 30,
        },
        {
          actorName: VP_APPROVER.name,
          actorEmail: VP_APPROVER.email,
          action: "Approved",
          detail: "Approved by VP review.",
          daysAgo: 7.2 * 30,
        },
        {
          actorName: FINANCE_APPROVER.name,
          actorEmail: FINANCE_APPROVER.email,
          action: "Approved",
          detail: "Finance review completed.",
          daysAgo: 7.1 * 30,
        },
        {
          actorName: SYSTEM_ACTOR.name,
          actorEmail: SYSTEM_ACTOR.email,
          action: "Marked active",
          detail: "Contract marked active.",
          daysAgo: 7 * 30,
        },
      ],
    },
    {
      recordNumber: recordNumber(18),
      title: "SOW #1 — Operational Efficiency Review — Meridian Strategy Group",
      templateType: "consulting",
      contractTypeLabel: "Statement of Work",
      counterparty: "Meridian Strategy Group LLC",
      contactName: "Patricia Okonkwo",
      contactEmail: "p.okonkwo@meridianstrategy.com",
      amount: 35_000,
      amountLabel: "$35,000",
      stage: "active",
      contractStatus: "active",
      requester: priya,
      startDate: monthsAgo(6),
      endDate: monthsAgo(2),
      parentRecordNumber: recordNumber(17),
      parentAgreementTitle: "Consulting Agreement — Meridian Strategy Group",
      workflowSteps: cr18Workflow.steps,
      currentStepIndex: cr18Workflow.currentStepIndex,
      activatedAt: monthsAgo(6),
      auditEvents: [
        {
          actorName: priya.name,
          actorEmail: priya.email,
          action: "Submitted contract",
          detail: "Submitted SOW #1 under consulting agreement CR-000017.",
          daysAgo: 7 * 30,
        },
        {
          actorName: LEGAL_APPROVER.name,
          actorEmail: LEGAL_APPROVER.email,
          action: "Approved",
          detail: "Legal review completed.",
          daysAgo: 6.5 * 30,
        },
        {
          actorName: VP_APPROVER.name,
          actorEmail: VP_APPROVER.email,
          action: "Approved",
          detail: "Approved by VP review.",
          daysAgo: 6.2 * 30,
        },
        {
          actorName: SYSTEM_ACTOR.name,
          actorEmail: SYSTEM_ACTOR.email,
          action: "Marked active",
          detail: "Contract marked active.",
          daysAgo: 6 * 30,
        },
      ],
    },
    {
      recordNumber: recordNumber(19),
      title:
        "Change Order #1 — SOW #1 — Extended Engagement Phase 2 — Meridian Strategy Group",
      templateType: "consulting",
      contractTypeLabel: "Change Order",
      counterparty: "Meridian Strategy Group LLC",
      contactName: "Patricia Okonkwo",
      contactEmail: "p.okonkwo@meridianstrategy.com",
      amount: 42_000,
      amountLabel: "$42,000",
      stage: "rejected",
      contractStatus: "rejected",
      requester: priya,
      startDate: null,
      endDate: null,
      parentRecordNumber: recordNumber(18),
      parentAgreementTitle:
        "SOW #1 — Operational Efficiency Review — Meridian Strategy Group",
      workflowSteps: cr19Workflow.steps,
      currentStepIndex: cr19Workflow.currentStepIndex,
      auditEvents: [
        {
          actorName: priya.name,
          actorEmail: priya.email,
          action: "Submitted contract",
          detail:
            "Phase 2 extension following completion of SOW CR-000018.",
          daysAgo: 3 * 30,
        },
        {
          actorName: LEGAL_APPROVER.name,
          actorEmail: LEGAL_APPROVER.email,
          action: "Approved",
          detail: "Legal review completed for change order.",
          daysAgo: 2.8 * 30,
        },
        {
          actorName: VP_APPROVER.name,
          actorEmail: VP_APPROVER.email,
          action: "Rejected",
          detail:
            "Phase 1 deliverables did not meet expectations. Will not extend engagement at this time.",
          daysAgo: 2.5 * 30,
        },
      ],
    },
  ];
}

function toJsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function buildOtherNotes(input: SeedContractInput): string | null {
  const notes = [
    input.otherNotes,
    input.autoRenewal
      ? `Auto renewal enabled${input.renewalNoticeDays ? ` with ${input.renewalNoticeDays}-day notice period` : ""}.`
      : null,
    input.templateType ? `Template type: ${input.templateType}.` : null,
  ].filter(Boolean);

  return notes.length > 0 ? notes.join(" ") : null;
}

async function resolveParentId(
  recordNumberById: Map<string, string>,
  parentRecordNumber?: string,
): Promise<{
  parentAgreementId: string | null;
  parentAgreementRecordNumber: string;
}> {
  if (!parentRecordNumber) {
    return {
      parentAgreementId: null,
      parentAgreementRecordNumber: "",
    };
  }

  const cachedId = recordNumberById.get(parentRecordNumber);

  if (cachedId) {
    return {
      parentAgreementId: cachedId,
      parentAgreementRecordNumber: parentRecordNumber,
    };
  }

  const prisma = getPrismaClient();
  const parent = await prisma.contract.findUnique({
    where: { recordNumber: parentRecordNumber },
    select: { id: true },
  });

  if (!parent) {
    throw new Error(
      `Parent contract ${parentRecordNumber} was not found before seeding child records.`,
    );
  }

  recordNumberById.set(parentRecordNumber, parent.id);

  return {
    parentAgreementId: parent.id,
    parentAgreementRecordNumber: parentRecordNumber,
  };
}

async function repairLegacySeedOrganization(): Promise<number> {
  const prisma = getPrismaClient();
  const result = await prisma.contract.updateMany({
    where: {
      recordNumber: { startsWith: "CR-0000" },
      organizationId: LEGACY_ORG_ID,
    },
    data: {
      organizationId: ORG_ID,
    },
  });

  return result.count;
}

async function seedContract(
  input: SeedContractInput,
  recordNumberById: Map<string, string>,
): Promise<"created" | "skipped" | "repaired"> {
  const prisma = getPrismaClient();
  const existing = await prisma.contract.findUnique({
    where: { recordNumber: input.recordNumber },
    select: { id: true, organizationId: true },
  });

  const parent = await resolveParentId(
    recordNumberById,
    input.parentRecordNumber,
  );
  const auditTrail = buildAuditTrail(input.auditEvents);
  const createdAt = auditTrail[0]?.timestamp
    ? new Date(auditTrail[0].timestamp)
    : new Date();
  const updatedAt = auditTrail[auditTrail.length - 1]?.timestamp
    ? new Date(auditTrail[auditTrail.length - 1].timestamp)
    : createdAt;

  if (existing) {
    await prisma.contract.update({
      where: { id: existing.id },
      data: {
        organizationId: ORG_ID,
        requesterName: input.requester.name,
        requesterEmail: input.requester.email,
        department: input.requester.department,
        workflowSteps: toJsonValue(input.workflowSteps),
        currentStepIndex: input.currentStepIndex,
        parentAgreementId: parent.parentAgreementId,
        parentAgreementRecordNumber: parent.parentAgreementRecordNumber,
        parentAgreementTitle: input.parentAgreementTitle ?? "",
      },
    });

    recordNumberById.set(input.recordNumber, existing.id);
    return "repaired";
  }

  const record = await prisma.contract.create({
    data: {
      organizationId: ORG_ID,
      recordNumber: input.recordNumber,
      requesterName: input.requester.name,
      requesterEmail: input.requester.email,
      department: input.requester.department,
      contractType: input.contractTypeLabel,
      contractStartDate: formatDate(input.startDate),
      contractEndDate: formatDate(input.endDate),
      title: input.title,
      description: input.description ?? input.title,
      amount: input.amountLabel,
      amountNumeric: new Prisma.Decimal(input.amount),
      budgeted: input.amount > 0 ? true : null,
      supplierName: input.counterparty,
      companyName: input.counterparty,
      mainContactName: input.contactName,
      mainContactEmail: input.contactEmail,
      parentAgreementId: parent.parentAgreementId,
      parentAgreementRecordNumber: parent.parentAgreementRecordNumber,
      parentAgreementTitle: input.parentAgreementTitle ?? "",
      otherNotes: buildOtherNotes(input),
      stage: input.stage,
      currentStepIndex: input.currentStepIndex,
      workflowSteps: toJsonValue(input.workflowSteps),
      auditTrail: toJsonValue(auditTrail),
      contractStatus: input.contractStatus,
      effectiveDate: input.startDate,
      expiryDate: input.endDate,
      activatedAt: input.activatedAt ?? null,
      createdAt,
      updatedAt,
    },
  });

  recordNumberById.set(input.recordNumber, record.id);
  return "created";
}

function printSummary(
  created: number,
  repaired: number,
  legacyRepairs: number,
): void {
  console.log(
    `Seed complete. Created ${created} contract records across 7 contract groups.`,
  );

  if (repaired > 0) {
    console.log(`Updated ${repaired} existing seed records for the app org.`);
  }

  if (legacyRepairs > 0) {
    console.log(
      `Repaired ${legacyRepairs} records previously stored under ${LEGACY_ORG_ID}.`,
    );
  }

  console.log(`
Contract hierarchy:
CR-000001 MSA (Apex) [active]
  ├── CR-000002 SOW #1 (Apex) [active]
  ├── CR-000003 SOW #2 (Apex) [finance_review]
  └── CR-000004 Amendment #1 (Apex) [legal_review]

CR-000005 NDA (Brightside) [active]
  └── CR-000006 MSA (Brightside) [active]
        ├── CR-000007 SOW #1 (Brightside) [awaiting_signature]
        └── CR-000008 Change Order #1 (Brightside) [vp_review]

CR-000009 Employment — Kenji Watanabe [active]
CR-000010 Employment — Amara Osei [legal_review]

CR-000011 SaaS — DataVault Pro [active] ⚠ renewing soon
  └── CR-000012 Amendment #1 — DataVault [draft]

CR-000013 SaaS — Nexus AI [rejected]

CR-000014 Partnership — CloudBridge [active]
  ├── CR-000015 Amendment #1 — CloudBridge [active]
  └── CR-000016 Amendment #2 — CloudBridge [executive_signoff]

CR-000017 Consulting — Meridian [active]
  └── CR-000018 SOW #1 — Meridian [active]
        └── CR-000019 Change Order #1 — Meridian [rejected]
`);
}

async function verifyContractHierarchy(): Promise<void> {
  const prisma = getPrismaClient();

  console.log("\n--- Hierarchy verification ---\n");

  const roots = await prisma.contract.findMany({
    where: {
      organizationId: ORG_ID,
      parentAgreementId: null,
    },
    orderBy: { recordNumber: "asc" },
    select: {
      recordNumber: true,
      title: true,
      stage: true,
    },
  });

  console.log("1. Root contracts (parentAgreementId is null):");
  for (const root of roots) {
    console.log(`   ${root.recordNumber} — ${root.title} [${root.stage}]`);
  }
  console.log(`   Total: ${roots.length}`);

  const cr1 = await prisma.contract.findUnique({
    where: { recordNumber: recordNumber(1) },
    select: { id: true, recordNumber: true },
  });

  console.log("\n2. Children of CR-000001:");
  if (!cr1) {
    console.log("   CR-000001 not found — cannot query children.");
  } else {
    const children = await prisma.contract.findMany({
      where: { parentAgreementId: cr1.id },
      orderBy: { recordNumber: "asc" },
      select: {
        recordNumber: true,
        title: true,
        stage: true,
      },
    });

    console.log(`   parentAgreementId = ${cr1.id}`);
    for (const child of children) {
      console.log(
        `   ${child.recordNumber} — ${child.title} [${child.stage}]`,
      );
    }

    const expectedChildren = [
      recordNumber(2),
      recordNumber(3),
      recordNumber(4),
    ];
    const actualChildren = children.map((child) => child.recordNumber);
    const childrenMatch =
      expectedChildren.length === actualChildren.length &&
      expectedChildren.every((record) => actualChildren.includes(record));

    console.log(`   Expected: ${expectedChildren.join(", ")}`);
    console.log(`   Actual:   ${actualChildren.join(", ")}`);
    console.log(`   Match: ${childrenMatch ? "yes" : "no"}`);
  }

  console.log("\n3. Parent chain for CR-000007:");
  let current = await prisma.contract.findUnique({
    where: { recordNumber: recordNumber(7) },
    select: {
      id: true,
      recordNumber: true,
      title: true,
      parentAgreementId: true,
    },
  });

  if (!current) {
    console.log("   CR-000007 not found — cannot walk parent chain.");
    return;
  }

  const chain: Array<{
    recordNumber: string;
    title: string;
    parentAgreementId: string | null;
  }> = [];

  while (current) {
    chain.push(current);

    if (!current.parentAgreementId) {
      break;
    }

    current = await prisma.contract.findUnique({
      where: { id: current.parentAgreementId },
      select: {
        id: true,
        recordNumber: true,
        title: true,
        parentAgreementId: true,
      },
    });
  }

  console.log(`   ${chain.map((record) => record.recordNumber).join(" → ")}`);
  for (const record of chain) {
    console.log(`   ${record.recordNumber} — ${record.title}`);
  }

  const expectedChain = [
    recordNumber(7),
    recordNumber(6),
    recordNumber(5),
  ];
  const actualChain = chain.map((record) => record.recordNumber);
  const chainMatch =
    expectedChain.length === actualChain.length &&
    expectedChain.every((record, index) => actualChain[index] === record);

  console.log(`   Expected: ${expectedChain.join(" → ")}`);
  console.log(`   Match: ${chainMatch ? "yes" : "no"}`);
}

async function main(): Promise<void> {
  const prisma = getPrismaClient();
  const contracts = buildSeedContracts();
  const recordNumberById = new Map<string, string>();
  let created = 0;
  let repaired = 0;

  const legacyRepairs = await repairLegacySeedOrganization();
  if (legacyRepairs > 0) {
    console.log(
      `Repaired organizationId on ${legacyRepairs} legacy seed record(s).`,
    );
  }

  for (const contract of contracts) {
    const result = await seedContract(contract, recordNumberById);

    if (result === "created") {
      created += 1;
    } else {
      repaired += 1;
    }
  }

  printSummary(created, repaired, legacyRepairs);
  await verifyContractHierarchy();
  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
