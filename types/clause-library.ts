import type { ClauseStatus } from "@/lib/generated/prisma/enums";

export const CLAUSE_CATEGORIES = [
  "Liability",
  "Payment",
  "Termination",
  "IP",
  "Confidentiality",
  "Warranty",
  "Governing Law",
  "Indemnification",
  "Other",
] as const;

export type ClauseCategory = (typeof CLAUSE_CATEGORIES)[number];

export const CLAUSE_STATUS_OPTIONS = [
  "approved",
  "approved_with_modification",
  "non_standard",
] as const;

export type ActiveClauseStatus = (typeof CLAUSE_STATUS_OPTIONS)[number];

export const CLAUSE_STATUS_LABELS: Record<ClauseStatus, string> = {
  approved: "Approved",
  approved_with_modification: "Approved with modification",
  non_standard: "Non-standard — requires review",
  deprecated: "Archived",
};

export const DEFAULT_ORGANIZATION_ID = "default";

export interface ClauseRecord {
  id: string;
  organizationId: string;
  title: string;
  category: string;
  contractTypes: string[];
  status: ClauseStatus;
  preferredText: string;
  alternativeText: string | null;
  notes: string | null;
  lastReviewedAt: string | null;
  createdById: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateClauseInput {
  organizationId?: string;
  title: string;
  category: string;
  contractTypes: string[];
  status: ActiveClauseStatus;
  preferredText: string;
  alternativeText?: string | null;
  notes?: string | null;
  createdById: string;
}

export interface UpdateClauseInput {
  title?: string;
  category?: string;
  contractTypes?: string[];
  status?: ActiveClauseStatus;
  preferredText?: string;
  alternativeText?: string | null;
  notes?: string | null;
}

export interface ClauseUsageRecord {
  id: string;
  clauseId: string;
  contractId: string;
  organizationId: string;
  usedText: string;
  isDeviation: boolean;
  createdAt: string;
}
