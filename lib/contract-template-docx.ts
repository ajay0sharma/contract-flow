import JSZip from "jszip";

const PLACEHOLDER_PATTERN = /\{\{([A-Z][A-Z0-9_]*)\}\}/g;

export const NO_PLACEHOLDER_WARNING =
  "No variable placeholders were detected in this document. If your template has fields that should be filled in by the requester, add {{VARIABLE_NAME}} placeholders in your Word document and re-upload.";

export async function extractDocxPlaceholders(
  fileBuffer: ArrayBuffer | Buffer,
): Promise<string[]> {
  const zip = await JSZip.loadAsync(fileBuffer);
  const documentXml = await zip.file("word/document.xml")?.async("string");

  if (!documentXml) {
    return [];
  }

  const decoded = documentXml
    .replace(/<[^>]+>/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ");

  const placeholders = new Set<string>();

  for (const match of decoded.matchAll(PLACEHOLDER_PATTERN)) {
    placeholders.add(match[1]);
  }

  return [...placeholders].sort();
}

export function buildPlaceholderWarning(
  placeholders: string[],
): string | null {
  return placeholders.length === 0 ? NO_PLACEHOLDER_WARNING : null;
}
