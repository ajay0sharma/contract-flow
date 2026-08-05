import { getAvailableCompanyConfigs } from "@/lib/company-config";
import type {
  AgreementTypeRules,
  WorkflowConfig,
  WorkflowDepartmentApprover,
  WorkflowRoutingRule,
  WorkflowStepDefinition,
} from "@/lib/workflow-config-types";

const defaultVpThreshold = 50000;

const defaultAgreementTypeRules: AgreementTypeRules = {
  parentAgreementTypes: [
    "Master Services Agreement",
    "Enterprise MSA",
    "Statement of Work",
    "Implementation SOW",
    "Work Order",
  ],
  childAgreementTypes: [
    "Statement of Work",
    "Implementation SOW",
    "Work Order",
    "Professional Services",
    "Change Order",
    "Amendment",
  ],
};

function getAllConfiguredDepartments(): string[] {
  return Array.from(
    new Set(
      getAvailableCompanyConfigs().flatMap((config) => config.departments),
    ),
  ).sort((a, b) => a.localeCompare(b));
}

function buildDefaultVpApprovers(): WorkflowDepartmentApprover[] {
  return getAllConfiguredDepartments().map((department) => ({
    department,
    assigneeName: `${department} VP`,
    assigneeEmail: `vp-${department.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}@example.com`,
  }));
}

const vpThresholdRule: WorkflowRoutingRule = {
  id: "vp-threshold",
  label: "Department VP approval threshold",
  description:
    "Route to the Vice President of the requesting department when contract amount meets or exceeds this threshold.",
  threshold: defaultVpThreshold,
};

const departmentVpStep: WorkflowStepDefinition = {
  id: "department-vp",
  name: "Department VP Approval",
  role: "Department VP",
  assigneeEmail: "vp@example.com",
  assigneeName: "Department VP",
  stage: "vp_review",
  minAmount: defaultVpThreshold,
};

const defaultWorkflowConfig: WorkflowConfig = {
  name: "Standard Contract Lifecycle",
  description:
    "Agiloft-style sequential routing: intake triggers legal review, with department VP, finance, and executive steps added based on contract value.",
  routingRules: [
    { ...vpThresholdRule },
    {
      id: "finance-threshold",
      label: "Finance review threshold",
      description: "Route to Finance when contract amount is $25,000 or more.",
      threshold: 25000,
    },
    {
      id: "executive-threshold",
      label: "Executive sign-off threshold",
      description:
        "Route to Executive when contract amount is $100,000 or more.",
      threshold: 100000,
    },
  ],
  steps: [
    {
      id: "legal",
      name: "Legal Review",
      role: "Legal",
      assigneeEmail: "ajay.sharma.jd@gmail.com",
      assigneeName: "Ajay Sharma",
      stage: "legal_review",
    },
    { ...departmentVpStep },
    {
      id: "finance",
      name: "Finance Review",
      role: "Finance",
      assigneeEmail: "marcus@example.com",
      assigneeName: "Marcus Chen",
      stage: "finance_review",
      minAmount: 25000,
    },
    {
      id: "executive",
      name: "Executive Sign-off",
      role: "Executive",
      assigneeEmail: "elena@example.com",
      assigneeName: "Elena Brooks",
      stage: "executive_signoff",
      minAmount: 100000,
    },
  ],
  vpDepartmentApprovers: buildDefaultVpApprovers(),
  agreementTypeRules: defaultAgreementTypeRules,
};

export function normalizeWorkflowConfig(config: WorkflowConfig): void {
  if (!config.routingRules.some((rule) => rule.id === "vp-threshold")) {
    config.routingRules.splice(1, 0, { ...vpThresholdRule });
  }

  if (!config.steps.some((step) => step.id === "department-vp")) {
    const legalIndex = config.steps.findIndex((step) => step.id === "legal");
    config.steps.splice(legalIndex === -1 ? 1 : legalIndex + 1, 0, {
      ...departmentVpStep,
    });
  }

  const existingApprovers = config.vpDepartmentApprovers ?? [];
  const existingByDepartment = new Map(
    existingApprovers.map((approver) => [approver.department, approver]),
  );

  config.vpDepartmentApprovers = getAllConfiguredDepartments().map(
    (department) =>
      existingByDepartment.get(department) ?? {
        department,
        assigneeName: `${department} VP`,
        assigneeEmail: `vp-${department.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}@example.com`,
      },
  );

  config.agreementTypeRules = {
    parentAgreementTypes: Array.from(
      new Set([
        ...(config.agreementTypeRules?.parentAgreementTypes ?? []),
        ...defaultAgreementTypeRules.parentAgreementTypes,
      ]),
    ).sort((a, b) => a.localeCompare(b)),
    childAgreementTypes: Array.from(
      new Set([
        ...(config.agreementTypeRules?.childAgreementTypes ?? []),
        ...defaultAgreementTypeRules.childAgreementTypes,
      ]),
    ).sort((a, b) => a.localeCompare(b)),
  };
}

export function syncStepThresholds(config: WorkflowConfig): void {
  const vpRule = config.routingRules.find((rule) => rule.id === "vp-threshold");
  const financeRule = config.routingRules.find(
    (rule) => rule.id === "finance-threshold",
  );
  const executiveRule = config.routingRules.find(
    (rule) => rule.id === "executive-threshold",
  );

  config.steps = config.steps.map((step) => {
    if (step.id === "department-vp") {
      return { ...step, minAmount: vpRule?.threshold ?? step.minAmount };
    }

    if (step.id === "finance") {
      return { ...step, minAmount: financeRule?.threshold ?? step.minAmount };
    }

    if (step.id === "executive") {
      return {
        ...step,
        minAmount: executiveRule?.threshold ?? step.minAmount,
      };
    }

    return step;
  });
}

export function getDefaultWorkflowConfig(): WorkflowConfig {
  return structuredClone(defaultWorkflowConfig);
}

export function cloneAndNormalizeWorkflowConfig(
  config: WorkflowConfig,
): WorkflowConfig {
  const cloned = structuredClone(config);
  normalizeWorkflowConfig(cloned);
  syncStepThresholds(cloned);
  return cloned;
}
