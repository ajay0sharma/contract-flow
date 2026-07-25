import type { ContractIntakeInput } from "@/types/contract";

export interface PoLineItem {
  description: string;
  quantity: number | null;
  unitPrice: number | null;
  totalPrice: number | null;
}

export interface PoLookupResult {
  found: boolean;
  poNumber: string;
  vendor: string | null;
  amount: number | null;
  currency: string | null;
  description: string | null;
  requestedBy: string | null;
  approvedBy: string | null;
  department: string | null;
  costCenter: string | null;
  lineItems: PoLineItem[] | null;
  rawData: Record<string, unknown>;
}

export interface IntakePoConfig {
  configured: boolean;
  isEnabled?: boolean;
  displayName?: string;
  autoPopulateOnMatch?: boolean;
  requirePoNumber?: boolean;
  allowedContractTypes?: string[] | null;
}

export function mapPoResultToFormFields(
  result: PoLookupResult,
): Partial<ContractIntakeInput> {
  const mapped: Partial<ContractIntakeInput> = {};

  if (result.vendor) {
    mapped.companyName = result.vendor;
  }

  if (result.amount !== null) {
    mapped.contractAmount = result.amount.toString();
  }

  if (result.description) {
    mapped.contractDescription = result.description;
  }

  if (result.department) {
    mapped.department = result.department;
  }

  return mapped;
}
