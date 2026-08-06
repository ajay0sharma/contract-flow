import type { SignatureProvider } from "@/lib/generated/prisma/enums";
import type {
  SendSignatureRequest,
  SendSignatureResult,
  SignatureTestResult,
} from "@/types/signature-integration";
import { sendDocuSignEnvelope, testDocuSignConnection } from "@/lib/signature-providers/docusign";
import { sendDropboxSignEnvelope, testDropboxSignConnection } from "@/lib/signature-providers/dropbox-sign";
import { sendManualSignatureEnvelope, testManualSignatureConnection } from "@/lib/signature-providers/manual";
import { sendWebhookBridgeEnvelope, testWebhookBridgeConnection } from "@/lib/signature-providers/webhook-bridge";

interface ProviderContext {
  provider: SignatureProvider;
  displayName: string;
  accountId: string | null;
  baseUrl: string | null;
  credentials: Record<string, string>;
}

export async function testSignatureProviderConnection(
  context: ProviderContext,
): Promise<SignatureTestResult> {
  switch (context.provider) {
    case "docusign":
      return testDocuSignConnection(context);
    case "dropbox_sign":
      return testDropboxSignConnection(context);
    case "webhook_bridge":
      return testWebhookBridgeConnection(context);
    case "manual":
      return testManualSignatureConnection(context);
    case "adobe_sign":
      return {
        success: false,
        message: "Adobe Sign connection testing is not implemented yet.",
        error: "Use webhook bridge or DocuSign for automated testing.",
      };
    default:
      return {
        success: false,
        message: "Unsupported signature provider.",
        error: `Unknown provider: ${context.provider}`,
      };
  }
}

export async function sendSignatureEnvelopeViaProvider(
  context: ProviderContext,
  request: SendSignatureRequest,
): Promise<SendSignatureResult> {
  switch (context.provider) {
    case "docusign":
      return sendDocuSignEnvelope(context, request);
    case "dropbox_sign":
      return sendDropboxSignEnvelope(context, request);
    case "webhook_bridge":
      return sendWebhookBridgeEnvelope(context, request);
    case "manual":
      return sendManualSignatureEnvelope(context, request);
    case "adobe_sign":
      throw new Error(
        "Adobe Sign send is not implemented yet. Use DocuSign, Dropbox Sign, or webhook bridge.",
      );
    default:
      throw new Error(`Unsupported signature provider: ${context.provider}`);
  }
}
