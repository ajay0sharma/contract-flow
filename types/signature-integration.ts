import type { SignatureEnvelopeStatus, SignatureProvider } from "@/lib/generated/prisma/enums";

export type SignatureSignerStatus =
  | "pending"
  | "sent"
  | "signed"
  | "declined";

export interface SignatureSigner {
  email: string;
  name: string;
  role: string;
  status: SignatureSignerStatus;
  signedAt?: string | null;
}

export interface SignatureIntegrationConfigRecord {
  organizationId: string;
  provider: SignatureProvider;
  isEnabled: boolean;
  displayName: string;
  accountId: string | null;
  baseUrl: string | null;
  hasStoredCredentials: boolean;
  hasWebhookSecret: boolean;
  autoActivateOnComplete: boolean;
  reminderDays: number;
  settings: Record<string, unknown> | null;
  lastTestAt: string | null;
  lastTestStatus: string | null;
  lastTestError: string | null;
}

export interface SignatureIntegrationConfigInput {
  provider?: SignatureProvider;
  isEnabled?: boolean;
  displayName?: string;
  accountId?: string | null;
  baseUrl?: string | null;
  credentials?: Record<string, string> | null;
  webhookSecret?: string | null;
  autoActivateOnComplete?: boolean;
  reminderDays?: number;
  settings?: Record<string, unknown> | null;
}

export interface SignatureEnvelopeView {
  id: string;
  organizationId: string;
  contractId: string;
  provider: SignatureProvider;
  externalEnvelopeId: string | null;
  status: SignatureEnvelopeStatus;
  subject: string | null;
  signers: SignatureSigner[];
  documentName: string | null;
  sentAt: string | null;
  completedAt: string | null;
  declinedAt: string | null;
  voidedAt: string | null;
  lastError: string | null;
  sentByEmail: string | null;
  sentByName: string | null;
  applicationUrl?: string | null;
}

export interface InitiateSignatureInput {
  counterparty: {
    email: string;
    name: string;
  };
  internalSigner: {
    email: string;
    name: string;
  };
}

export interface SignatureDocumentPayload {
  fileName: string;
  contentType: string;
  base64Content: string;
  downloadUrl?: string | null;
}

export interface SendSignatureRequest {
  contractId: string;
  organizationId: string;
  subject: string;
  signers: SignatureSigner[];
  document: SignatureDocumentPayload;
  actorEmail: string;
  actorName: string;
}

export interface SendSignatureResult {
  externalEnvelopeId: string | null;
  status: SignatureEnvelopeStatus;
  applicationUrl?: string | null;
  metadata?: Record<string, unknown>;
}

export interface SignatureTestResult {
  success: boolean;
  message: string;
  error?: string | null;
}
