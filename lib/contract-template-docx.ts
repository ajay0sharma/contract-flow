import JSZip from "jszip";

const PLACEHOLDER_PATTERN = /\{\{([A-Z][A-Z0-9_]*)\}\}/g;

export const NO_PLACEHOLDER_WARNING =
  "No variable placeholders were detected in this document. If your template has fields that should be filled in by the requester, add {{VARIABLE_NAME}} placeholders in your Word document and re-upload.";

export interface DocxMergeResult {
  buffer: Buffer;
  placeholders: string[];
  mergedVariables: string[];
  missingVariables: string[];
}

function escapeXmlText(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function collectPlaceholdersFromXml(xml: string): Set<string> {
  const decoded = xml
    .replace(/<[^>]+>/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ");

  const placeholders = new Set<string>();

  for (const match of decoded.matchAll(PLACEHOLDER_PATTERN)) {
    placeholders.add(match[1]);
  }

  return placeholders;
}

export async function extractDocxPlaceholders(
  fileBuffer: ArrayBuffer | Buffer,
): Promise<string[]> {
  const zip = await JSZip.loadAsync(fileBuffer);
  const documentXml = await zip.file("word/document.xml")?.async("string");

  if (!documentXml) {
    return [];
  }

  return [...collectPlaceholdersFromXml(documentXml)].sort();
}

export function buildPlaceholderWarning(
  placeholders: string[],
): string | null {
  return placeholders.length === 0 ? NO_PLACEHOLDER_WARNING : null;
}

export async function mergeDocxPlaceholders(
  fileBuffer: ArrayBuffer | Buffer,
  values: Record<string, string>,
): Promise<DocxMergeResult> {
  const zip = await JSZip.loadAsync(fileBuffer);
  const placeholders = new Set<string>();
  const xmlPaths = Object.keys(zip.files).filter(
    (path) => path.startsWith("word/") && path.endsWith(".xml"),
  );

  for (const path of xmlPaths) {
    const file = zip.file(path);

    if (!file) {
      continue;
    }

    let xml = await file.async("string");
    const pathPlaceholders = collectPlaceholdersFromXml(xml);

    for (const name of pathPlaceholders) {
      placeholders.add(name);
    }

    for (const [name, rawValue] of Object.entries(values)) {
      const token = `{{${name}}}`;
      const replacement = escapeXmlText(String(rawValue ?? "").trim());

      if (xml.includes(token)) {
        xml = xml.split(token).join(replacement);
      }
    }

    zip.file(path, xml);
  }

  const placeholderList = [...placeholders].sort();
  const mergedVariables = placeholderList.filter((name) =>
    Boolean(String(values[name] ?? "").trim()),
  );
  const missingVariables = placeholderList.filter(
    (name) => !String(values[name] ?? "").trim(),
  );

  const buffer = Buffer.from(
    await zip.generateAsync({
      type: "arraybuffer",
      compression: "DEFLATE",
    }),
  );

  return {
    buffer,
    placeholders: placeholderList,
    mergedVariables,
    missingVariables,
  };
}
