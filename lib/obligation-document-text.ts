import mammoth from "mammoth";

export async function extractTextFromDocument(
  buffer: Buffer,
  fileName: string,
): Promise<string> {
  const extension = fileName.split(".").pop()?.toLowerCase() ?? "";

  if (extension === "pdf") {
    const pdfModule = await import("pdf-parse");
    const pdfParse =
      "default" in pdfModule && typeof pdfModule.default === "function"
        ? pdfModule.default
        : (pdfModule as unknown as (buffer: Buffer) => Promise<{ text: string }>);
    const data = await pdfParse(buffer);
    return data.text ?? "";
  }

  if (extension === "docx") {
    const result = await mammoth.extractRawText({ buffer });
    return result.value ?? "";
  }

  throw new Error("Unsupported document type. Only PDF and Word documents are supported.");
}

export function validateExtractedText(text: string): string | null {
  if (text.trim().length < 100) {
    return "Could not extract text from the document. The file may be a scanned image PDF. Please upload a text-based PDF or Word document.";
  }

  return null;
}

export function validateExecutedDocumentFile(
  fileName: string,
  sizeBytes: number,
): string | null {
  const extension = fileName.split(".").pop()?.toLowerCase() ?? "";

  if (extension !== "pdf" && extension !== "docx") {
    return "Only PDF and Word (.docx) documents are supported.";
  }

  if (sizeBytes > 50 * 1024 * 1024) {
    return "File size must be 50MB or less.";
  }

  return null;
}

export function resolveDocumentContentType(fileName: string): string {
  const extension = fileName.split(".").pop()?.toLowerCase() ?? "";

  if (extension === "pdf") {
    return "application/pdf";
  }

  return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
}
