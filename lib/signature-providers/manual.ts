import type {
  SendSignatureRequest,
  SendSignatureResult,
  SignatureTestResult,
} from "@/types/signature-integration";

interface ProviderContext {
  displayName: string;
}

export async function testManualSignatureConnection(
  _context: ProviderContext,
): Promise<SignatureTestResult> {
  return {
    success: true,
    message: "Manual signature tracking is ready.",
  };
}

export async function sendManualSignatureEnvelope(
  _context: ProviderContext,
  request: SendSignatureRequest,
): Promise<SendSignatureResult> {
  return {
    externalEnvelopeId: null,
    status: "sent",
    metadata: {
      mode: "manual",
      contractId: request.contractId,
      signerCount: request.signers.length,
    },
  };
}
