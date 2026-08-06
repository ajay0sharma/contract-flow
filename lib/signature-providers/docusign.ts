import jwt from "jsonwebtoken";
import { DEFAULT_DOCUSIGN_BASE_URL } from "@/lib/signature-settings";
import type {
  SendSignatureRequest,
  SendSignatureResult,
  SignatureTestResult,
} from "@/types/signature-integration";

interface ProviderContext {
  accountId: string | null;
  baseUrl: string | null;
  credentials: Record<string, string>;
}

function resolveAuthHost(baseUrl: string | null): string {
  if (baseUrl?.includes("demo.docusign.net") || baseUrl?.includes("account-d")) {
    return "account-d.docusign.com";
  }

  return "account.docusign.com";
}

function resolveRestBaseUrl(baseUrl: string | null): string {
  return baseUrl?.trim() || DEFAULT_DOCUSIGN_BASE_URL;
}

async function getDocuSignAccessToken(
  context: ProviderContext,
): Promise<string> {
  const integrationKey = context.credentials.integrationKey?.trim();
  const userId = context.credentials.userId?.trim();
  const privateKey = context.credentials.rsaPrivateKey?.trim();

  if (!integrationKey || !userId || !privateKey) {
    throw new Error(
      "DocuSign requires integration key, user ID, and RSA private key.",
    );
  }

  const authHost = resolveAuthHost(context.baseUrl);
  const assertion = jwt.sign(
    {
      iss: integrationKey,
      sub: userId,
      aud: authHost,
      scope: "signature impersonation",
    },
    privateKey,
    { algorithm: "RS256", expiresIn: "1h" },
  );

  const body = new URLSearchParams({
    grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
    assertion,
  });

  const response = await fetch(`https://${authHost}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  const payload = (await response.json()) as {
    access_token?: string;
    error?: string;
    error_description?: string;
  };

  if (!response.ok || !payload.access_token) {
    throw new Error(
      payload.error_description ??
        payload.error ??
        "Unable to authenticate with DocuSign.",
    );
  }

  return payload.access_token;
}

export async function testDocuSignConnection(
  context: ProviderContext,
): Promise<SignatureTestResult> {
  try {
    const token = await getDocuSignAccessToken(context);
    const accountId = context.accountId?.trim();

    if (!accountId) {
      return {
        success: true,
        message: "DocuSign authentication succeeded. Add an account ID to send envelopes.",
      };
    }

    const response = await fetch(
      `${resolveRestBaseUrl(context.baseUrl)}/v2.1/accounts/${accountId}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    );

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      return {
        success: false,
        message: "DocuSign account lookup failed.",
        error: text || `HTTP ${response.status}`,
      };
    }

    return {
      success: true,
      message: "DocuSign connection verified.",
    };
  } catch (error) {
    return {
      success: false,
      message: "DocuSign connection test failed.",
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

export async function sendDocuSignEnvelope(
  context: ProviderContext,
  request: SendSignatureRequest,
): Promise<SendSignatureResult> {
  const accountId = context.accountId?.trim();

  if (!accountId) {
    throw new Error("DocuSign account ID is required.");
  }

  const token = await getDocuSignAccessToken(context);
  const signers = request.signers.map((signer, index) => ({
    email: signer.email,
    name: signer.name,
    recipientId: String(index + 1),
    routingOrder: String(index + 1),
  }));

  const response = await fetch(
    `${resolveRestBaseUrl(context.baseUrl)}/v2.1/accounts/${accountId}/envelopes`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        emailSubject: request.subject,
        status: "sent",
        documents: [
          {
            documentBase64: request.document.base64Content,
            name: request.document.fileName,
            fileExtension: request.document.fileName.split(".").pop() ?? "pdf",
            documentId: "1",
          },
        ],
        recipients: {
          signers: signers.map((signer) => ({
            ...signer,
            tabs: {
              signHereTabs: [
                {
                  documentId: "1",
                  pageNumber: "1",
                  xPosition: "100",
                  yPosition: "150",
                },
              ],
            },
          })),
        },
      }),
    },
  );

  const payload = (await response.json()) as {
    envelopeId?: string;
    message?: string;
    errorCode?: string;
  };

  if (!response.ok || !payload.envelopeId) {
    throw new Error(
      payload.message ??
        payload.errorCode ??
        "DocuSign failed to create an envelope.",
    );
  }

  return {
    externalEnvelopeId: payload.envelopeId,
    status: "sent",
    metadata: payload,
  };
}
