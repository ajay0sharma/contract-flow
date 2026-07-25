import type { ObligationType as PrismaObligationType } from "@/lib/generated/prisma/enums";
import { OBLIGATION_TYPE_VALUES } from "@/lib/obligation-types";

export const OBLIGATION_TYPES = OBLIGATION_TYPE_VALUES;

export type ObligationType = PrismaObligationType;

export interface ScannedObligationItem {
  description: string;
  obligationType: ObligationType | string;
  dueDate: string | null;
  isRecurring: boolean;
  frequency: string | null;
  noticePeriodDays?: number | null;
  sourceClause?: string | null;
  responsibleParty?: string | null;
  confidenceScore?: string | null;
}

export interface ObligationScanResult {
  summary: string;
  obligations: ScannedObligationItem[];
}

export interface ContractObligationView {
  contractId: string;
  scanStatus: "not_scanned" | "scanning" | "completed" | "failed";
  scanCompletedAt: string | null;
  scanVersion?: number | null;
  summary: string | null;
  obligations: ScannedObligationItem[];
  sourceAttachmentName: string | null;
  executedDocument?: {
    name: string | null;
    size: number | null;
    uploadedAt: string | null;
    uploadedById: string | null;
  } | null;
}

export interface ObligationReportEntry {
  contractId: string;
  recordNumber: string;
  contractTitle: string;
  contractType: string;
  department: string;
  counterpartyName: string;
  obligationType: string;
  description: string;
  dueDate: string | null;
  isRecurring: boolean;
  frequency: string | null;
  status: string;
  scanStatus: string;
  obligationSummary: string | null;
  responsibleParty?: string | null;
  sourceClause?: string | null;
  noticePeriodDays?: number | null;
  contractStage?: string | null;
  contractLifecycleStatus?: string | null;
}
