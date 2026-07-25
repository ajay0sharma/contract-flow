export const INTAKE_DOCUMENT_TYPES = [
  "quote_proposal",
  "third_party_document",
  "fully_executed_agreement",
  "w9",
  "supporting_document",
] as const;

export type IntakeDocumentType = (typeof INTAKE_DOCUMENT_TYPES)[number];

export const INTAKE_DOCUMENT_TYPE_LABELS: Record<IntakeDocumentType, string> = {
  quote_proposal: "Quote/Proposal",
  third_party_document: "Document Provided by Third Party",
  fully_executed_agreement: "Fully Executed Agreement",
  w9: "W-9",
  supporting_document: "Supporting Document",
};

export const MAX_INTAKE_ATTACHMENT_BYTES = 10 * 1024 * 1024;

export function getIntakeDocumentTypeLabel(type: IntakeDocumentType): string {
  return INTAKE_DOCUMENT_TYPE_LABELS[type];
}

export function isIntakeDocumentType(value: string): value is IntakeDocumentType {
  return INTAKE_DOCUMENT_TYPES.includes(value as IntakeDocumentType);
}
