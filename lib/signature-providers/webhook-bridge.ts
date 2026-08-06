import type {
  SendSignatureRequest,
  SendSignatureResult,
  SignatureTestResult,
} from "@/types/signature-integration";

interface ProviderContext {
  displayName: string;
  credentials: Record<string, string>;
}

export async function testWebhookBridgeConnection(
  context: ProviderContext,
): Promise<SignatureTestResult> {
  const webhookUrl = context.credentials.webhookUrl?.trim();

  if (!webhookUrl) {
    return {
      success: false,
      message: "Webhook URL is required.",
      error: "Enter the client e-signature application webhook URL.",
    };
  }

  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: buildHeaders(context.credentials),
      body: JSON.stringify({
        event: "connection_test",
        provider: "contract-flow",
        displayName: context.displayName,
      }),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      return {
        success: false,
        message: "Webhook connection test failed.",
        error: text || `HTTP ${response.status}`,
      };
    }

    return {
      success: true,
      message: "Webhook bridge responded successfully.",
    };
  } catch (error) {
    return {
      success: false,
      message: "Webhook connection test failed.",
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

export async function sendWebhookBridgeEnvelope(
  context: ProviderContext,
  request: SendSignatureRequest,
): Promise<SendSignatureResult> {
  const webhookUrl = context.credentials.webhookUrl?.trim();

  if (!webhookUrl) {
    throw new Error("Webhook URL is required for client e-signature apps.");
  }

  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: buildHeaders(context.credentials),
    body: JSON.stringify({
      event: "send_for_signature",
      contractId: request.contractId,
      organizationId: request.organizationId,
      subject: request.subject,
      signers: request.signers,
      document: {
        fileName: request.document.fileName,
        contentType: request.document.contentType,
        downloadUrl: request.document.downloadUrl,
        base64Content: request.document.base64Content,
      },
      callbackUrl: buildCallbackUrl(request.organizationId),
    }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(text || `Client e-signature webhook failed (${response.status}).`);
  }

  const payload = (await response.json().catch(() => ({}))) as {
    envelopeId?: string;
    externalEnvelopeId?: string;
    status?: string;
    applicationUrl?: string;
    signingUrl?: string;
    portalUrl?: string;
    url?: string;
  };

  return {
    externalEnvelopeId:
      payload.envelopeId ?? payload.externalEnvelopeId ?? null,
    status: "sent",
    applicationUrl:
      payload.applicationUrl ??
      payload.signingUrl ??
      payload.portalUrl ??
      payload.url ??
      null,
    metadata: {
      providerResponse: payload,
    },
  };
}

function buildHeaders(credentials: Record<string, string>): HeadersInit {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  const apiKey = credentials.apiKey?.trim();

  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`;
  }

  return headers;
}

function buildCallbackUrl(organizationId: string): string {
  const base =
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    process.env.VERCEL_URL?.trim() ||
    "http://localhost:3000";

  const normalizedBase = base.startsWith("http") ? base : `https://${base}`;
  return `${normalizedBase}/api/webhooks/signature?organizationId=${encodeURIComponent(organizationId)}`;
}
