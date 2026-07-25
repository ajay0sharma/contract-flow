import { DOWNLOAD_LINK_ERROR_MESSAGE } from "@/types/contract-template";

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
  const payload = (await response.json()) as {
    signedUrl?: string;
    error?: string;
  };

  if (!response.ok || !payload.signedUrl) {
    throw new Error(payload.error ?? DOWNLOAD_LINK_ERROR_MESSAGE);
  }

  window.open(payload.signedUrl, "_blank", "noopener,noreferrer");
}
