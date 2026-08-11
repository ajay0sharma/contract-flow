export type ContractStage =
  | "request"
  | "legal_review"
  | "vp_review"
  | "finance_review"
  | "executive_signoff"
  | "awaiting_signature"
  | "active"
  | "expired"
  | "rejected";

export type ContractLifecycleStatus =
  | "draft"
  | "pending"
  | "active"
  | "expired"
  | "rejected";

export type RenewalStatus =
  | "not_due"
  | "notice_window"
  | "renewal_in_progress"
  | "renewed"
  | "non_renewing";

export type RenewalReminderType =
  | "notice_90"
  | "notice_60"
  | "notice_30"
  | "notice_14"
  | "notice_7"
  | "expiration_day"
  | "action_deadline";

export type WorkflowStepStatus =
  | "completed"
  | "current"
  | "upcoming"
  | "skipped"
  | "rejected";

export interface WorkflowStep {
  id: string;
  name: string;
  role: string;
  assigneeEmail: string;
  assigneeName: string;
  status: WorkflowStepStatus;
  completedAt?: string;
  note?: string;
}

export interface AuditEvent {
  id: string;
  timestamp: string;
  actorName: string;
  actorEmail: string;
  action: string;
  detail: string;
  fieldsUpdated?: string[];
}

export type IntakeDocumentType =
  | "quote_proposal"
  | "third_party_document"
  | "fully_executed_agreement"
  | "w9"
  | "supporting_document";

export interface ContractAttachment {
  id: string;
  title: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  documentType: IntakeDocumentType;
  uploadedAt: string;
  uploadedByName: string;
  uploadedByEmail: string;
  dataBase64: string;
}

export interface ContractIntakeAttachmentInput {
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  documentType: IntakeDocumentType;
  dataBase64: string;
}

export type ContractEmailSource =
  | "manual"
  | "outlook_export"
  | "gmail_export"
  | "sent"
  | "provider_sync";

export type CapturedContractEmailSource =
  | "manual"
  | "outlook_export"
  | "gmail_export";

export type ContractEmailDirection = "inbound" | "outbound";

export type ContractEmailProvider = "microsoft" | "google" | "webhook";

export interface ContractEmail {
  id: string;
  subject: string;
  from: string;
  to: string;
  cc: string;
  sentAt: string;
  body: string;
  source: ContractEmailSource;
  direction?: ContractEmailDirection;
  provider?: ContractEmailProvider;
  providerMessageId?: string;
  addedByName: string;
  addedByEmail: string;
  addedAt: string;
  emlFileName?: string;
  emlDataBase64?: string;
}

export interface AddContractEmailInput {
  subject: string;
  from: string;
  to: string;
  cc?: string;
  sentAt: string;
  body: string;
  source: CapturedContractEmailSource;
  emlFileName?: string;
  emlDataBase64?: string;
}

export interface AppendContractEmailInput {
  subject: string;
  from: string;
  to: string;
  cc?: string;
  sentAt: string;
  body: string;
  source: ContractEmailSource;
  direction?: ContractEmailDirection;
  provider?: ContractEmailProvider;
  providerMessageId?: string;
  emlFileName?: string;
  emlDataBase64?: string;
}

export interface SendContractEmailInput {
  to: string;
  cc?: string;
  subject: string;
  body: string;
}

export interface ContractIntakeInput {
  requesterName: string;
  requesterEmail: string;
  department: string;
  contractType: string;
  contractStartDate: string;
  contractEndDate: string;
  contractTitle: string;
  contractDescription: string;
  contractAmount: string;
  budgeted?: boolean;
  poNumber?: string;
  parentAgreementId?: string;
  otherNotes: string;
  companyName: string;
  address: string;
  mainContactName: string;
  mainContactTitle?: string;
  mainContactEmail: string;
  mainContactPhone?: string;
  counterpartyId?: string;
  companyProfileId: string;
  attachments?: ContractIntakeAttachmentInput[];
  templateId?: string;
  templateVersion?: number;
  intakeFormId?: string;
  customFields?: Record<string, string>;
  templateVariables?: Record<string, string>;
}

export interface ContractRecordUpdateInput {
  department: string;
  contractType: string;
  contractStartDate: string;
  contractEndDate: string;
  title: string;
  description: string;
  amount: string;
  budgeted: boolean | null;
  poNumber: string;
  supplierId: string;
  supplierName: string;
  otherNotes: string;
  companyName: string;
  address: string;
  mainContactName: string;
  mainContactTitle: string;
  mainContactEmail: string;
  mainContactPhone: string;
}

export interface ContractRecord {
  id: string;
  recordNumber: string;
  requesterName: string;
  requesterEmail: string;
  department: string;
  contractType: string;
  contractStartDate: string;
  contractEndDate: string;
  title: string;
  description: string;
  amount: string;
  amountNumeric: number;
  budgeted: boolean | null;
  poNumber: string;
  supplierId: string;
  supplierName: string;
  parentAgreementId: string | null;
  parentAgreementRecordNumber: string;
  parentAgreementTitle: string;
  confidential: boolean;
  otherNotes: string;
  companyName: string;
  address: string;
  mainContactName: string;
  mainContactTitle: string;
  mainContactEmail: string;
  mainContactPhone: string;
  counterpartyId: string | null;
  companyProfileId: string;
  templateId: string | null;
  templateVersion: number | null;
  intakeFormId?: string | null;
  stage: ContractStage;
  contractStatus?: ContractLifecycleStatus;
  expiryDate?: string | null;
  effectiveDate?: string | null;
  activatedAt?: string | null;
  expiredAt?: string | null;
  autoRenewal?: boolean;
  renewalNoticeDays?: number;
  renewalStatus?: RenewalStatus;
  renewedFromContractId?: string | null;
  renewalStartedAt?: string | null;
  contractVariables?: Record<string, string> | null;
  generatedDraftPath?: string | null;
  missingVariables?: string[] | null;
  workflowSteps: WorkflowStep[];
  currentStepIndex: number;
  auditTrail: AuditEvent[];
  attachments: ContractAttachment[];
  relatedEmails: ContractEmail[];
  createdAt: string;
  updatedAt: string;
}

/** @deprecated Use ContractRecord.stage instead */
export type ContractStatus = ContractStage;

/** @deprecated Use ContractRecord instead */
export type Contract = ContractRecord;
