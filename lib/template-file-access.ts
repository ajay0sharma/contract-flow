import { DOWNLOAD_LINK_ERROR_MESSAGE } from "@/types/contract-template";

async function openSignedDocumentDownload(
  response: Response,
): Promise<{ signedUrl: string; isGeneratedDraft?: boolean; missingVariables?: string[] }> {
  const payload = (await response.json()) as {
    signedUrl?: string;
    error?: string;
    isGeneratedDraft?: boolean;
    missingVariables?: string[];
  };

  if (!response.ok || !payload.signedUrl) {
    throw new Error(payload.error ?? DOWNLOAD_LINK_ERROR_MESSAGE);
  }

  window.open(payload.signedUrl, "_blank", "noopener,noreferrer");

  return {
    signedUrl: payload.signedUrl,
    isGeneratedDraft: payload.isGeneratedDraft,
    missingVariables: payload.missingVariables,
  };
}

export async function openTemplateDocument(
  templateId: string,
  version: number,
  intent: "open" | "download" = "open",
): Promise<void> {
  const params = new URLSearchParams({
    version: String(version),
    intent,
  });
  const response = await fetch(
    `/api/templates/${templateId}/download?${params.toString()}`,
  );
  await openSignedDocumentDownload(response);
}

export async function openContractDraftDocument(
  contractId: string,
): Promise<{ isGeneratedDraft?: boolean; missingVariables?: string[] }> {
  const response = await fetch(`/api/contracts/${contractId}/template-download`);
  const result = await openSignedDocumentDownload(response);

  return {
    isGeneratedDraft: result.isGeneratedDraft,
    missingVariables: result.missingVariables,
  };
}
