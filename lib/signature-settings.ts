import type { SignatureProvider } from "@/lib/generated/prisma/enums";

export interface SignatureProviderOption {
  id: SignatureProvider;
  name: string;
  description: string;
  defaultDisplayName: string;
  credentialFields: Array<{
    key: string;
    label: string;
    type?: "text" | "password" | "textarea";
    placeholder?: string;
    required?: boolean;
  }>;
  supportsWebhookBridge?: boolean;
}

export const SIGNATURE_PROVIDER_OPTIONS: SignatureProviderOption[] = [
  {
    id: "docusign",
    name: "DocuSign",
    description: "Send envelopes through DocuSign eSignature",
    defaultDisplayName: "DocuSign",
    credentialFields: [
      {
        key: "integrationKey",
        label: "Integration key (client ID)",
        placeholder: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
        required: true,
      },
      {
        key: "userId",
        label: "User ID (GUID)",
        placeholder: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
        required: true,
      },
      {
        key: "rsaPrivateKey",
        label: "RSA private key (PEM)",
        type: "textarea",
        placeholder: "-----BEGIN RSA PRIVATE KEY-----",
        required: true,
      },
    ],
  },
  {
    id: "dropbox_sign",
    name: "Dropbox Sign",
    description: "Send signature requests through Dropbox Sign (HelloSign)",
    defaultDisplayName: "Dropbox Sign",
    credentialFields: [
      {
        key: "apiKey",
        label: "API key",
        type: "password",
        required: true,
      },
    ],
  },
  {
    id: "adobe_sign",
    name: "Adobe Acrobat Sign",
    description: "Connect to Adobe Acrobat Sign REST API",
    defaultDisplayName: "Adobe Sign",
    credentialFields: [
      {
        key: "clientId",
        label: "Client ID",
        required: true,
      },
      {
        key: "clientSecret",
        label: "Client secret",
        type: "password",
        required: true,
      },
      {
        key: "refreshToken",
        label: "Refresh token",
        type: "password",
        required: true,
      },
    ],
  },
  {
    id: "webhook_bridge",
    name: "Client e-signature app",
    description:
      "Forward contracts to your client's e-signature application via webhook",
    defaultDisplayName: "Client e-signature app",
    supportsWebhookBridge: true,
    credentialFields: [
      {
        key: "webhookUrl",
        label: "Send webhook URL",
        placeholder: "https://client-app.example.com/contracts/send-for-signature",
        required: true,
      },
      {
        key: "apiKey",
        label: "API key (optional)",
        type: "password",
      },
    ],
  },
  {
    id: "manual",
    name: "Manual signature",
    description:
      "Track signature outside the system and mark contracts active when complete",
    defaultDisplayName: "Manual signature",
    credentialFields: [],
  },
];

export function getSignatureProviderOption(
  provider: SignatureProvider,
): SignatureProviderOption | undefined {
  return SIGNATURE_PROVIDER_OPTIONS.find((option) => option.id === provider);
}

export const DEFAULT_DOCUSIGN_BASE_URL = "https://demo.docusign.net/restapi";

export const DEFAULT_DROPBOX_SIGN_BASE_URL = "https://api.hellosign.com/v3";

export const DEFAULT_ADOBE_SIGN_BASE_URL =
  "https://api.na1.adobesign.com/api/rest/v6";

export function resolveSignatureApplicationUrl(options: {
  provider: SignatureProvider;
  externalEnvelopeId: string | null;
  baseUrl: string | null;
  metadata?: Record<string, unknown> | null;
}): string | null {
  const metadata = options.metadata ?? {};
  const providerResponse =
    metadata.providerResponse &&
    typeof metadata.providerResponse === "object" &&
    !Array.isArray(metadata.providerResponse)
      ? (metadata.providerResponse as Record<string, unknown>)
      : null;

  const directUrl =
    pickUrl(metadata) ??
    (providerResponse ? pickUrl(providerResponse) : null);

  if (directUrl) {
    return directUrl;
  }

  if (!options.externalEnvelopeId) {
    return null;
  }

  switch (options.provider) {
    case "docusign": {
      const host =
        options.baseUrl?.includes("demo.docusign.net") ||
        options.baseUrl?.includes("account-d")
          ? "apps-d.docusign.com"
          : "apps.docusign.com";

      return `https://${host}/send/documents/details/${options.externalEnvelopeId}`;
    }
    case "dropbox_sign":
      return `https://app.hellosign.com/home/manage?guid=${encodeURIComponent(options.externalEnvelopeId)}`;
    default:
      return null;
  }
}

function pickUrl(record: Record<string, unknown>): string | null {
  for (const key of [
    "applicationUrl",
    "signingUrl",
    "portalUrl",
    "url",
    "launchUrl",
  ]) {
    const value = record[key];

    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return null;
}
