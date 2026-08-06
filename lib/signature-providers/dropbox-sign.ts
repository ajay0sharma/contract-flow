import { DEFAULT_DROPBOX_SIGN_BASE_URL } from "@/lib/signature-settings";
import type {
  SendSignatureRequest,
  SendSignatureResult,
  SignatureTestResult,
} from "@/types/signature-integration";

interface ProviderContext {
  baseUrl: string | null;
  credentials: Record<string, string>;
}

function resolveBaseUrl(baseUrl: string | null): string {
  return baseUrl?.trim() || DEFAULT_DROPBOX_SIGN_BASE_URL;
}

function buildAuthHeader(credentials: Record<string, string>): string {
  const apiKey = credentials.apiKey?.trim();

  if (!apiKey) {
    throw new Error("Dropbox Sign API key is required.");
  }

  return `Basic ${Buffer.from(`${apiKey}:`).toString("base64")}`;
}

export async function testDropboxSignConnection(
  context: ProviderContext,
): Promise<SignatureTestResult> {
  try {
    const response = await fetch(`${resolveBaseUrl(context.baseUrl)}/account`, {
      headers: {
        Authorization: buildAuthHeader(context.credentials),
      },
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      return {
        success: false,
        message: "Dropbox Sign connection test failed.",
        error: text || `HTTP ${response.status}`,
      };
    }

    return {
      success: true,
      message: "Dropbox Sign connection verified.",
    };
  } catch (error) {
    return {
      success: false,
      message: "Dropbox Sign connection test failed.",
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

export async function sendDropboxSignEnvelope(
  context: ProviderContext,
  request: SendSignatureRequest,
): Promise<SendSignatureResult> {
  const primarySigner = request.signers[0];

  if (!primarySigner) {
    throw new Error("At least one signer is required.");
  }

  const form = new FormData();
  form.append("title", request.subject);
  form.append("subject", request.subject);
  form.append(
    "signers",
    JSON.stringify([
      {
        email_address: primarySigner.email,
        name: primarySigner.name,
        order: 0,
      },
    ]),
  );

  if (request.document.downloadUrl) {
    form.append("file_url[]", request.document.downloadUrl);
  } else {
    form.append(
      "file",
      new Blob([Buffer.from(request.document.base64Content, "base64")], {
        type: request.document.contentType,
      }),
      request.document.fileName,
    );
  }

  const response = await fetch(
    `${resolveBaseUrl(context.baseUrl)}/signature_request/send`,
    {
      method: "POST",
      headers: {
        Authorization: buildAuthHeader(context.credentials),
      },
      body: form,
    },
  );

  const payload = (await response.json()) as {
    signature_request?: { signature_request_id?: string };
    error?: { error_msg?: string };
  };

  if (!response.ok) {
    throw new Error(
      payload.error?.error_msg ?? "Dropbox Sign failed to create a signature request.",
    );
  }

  return {
    externalEnvelopeId:
      payload.signature_request?.signature_request_id ?? null,
    status: "sent",
    metadata: payload,
  };
}
