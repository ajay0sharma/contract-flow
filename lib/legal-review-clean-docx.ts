import JSZip from "jszip";
import { findDeviationForAlignmentBlock } from "@/lib/legal-review-deviation-match";
import type {
  LegalReviewAlignmentBlock,
  LegalReviewDeviation,
} from "@/types/legal-review";

function escapeXml(value: string): string {
  return value
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function paragraph(text: string): string {
  return `<w:p><w:r><w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r></w:p>`;
}

function resolveBlockText(
  block: LegalReviewAlignmentBlock,
  deviation: LegalReviewDeviation | undefined,
): string | null {
  const status = deviation?.status ?? "open";

  switch (block.kind) {
    case "unchanged":
      return block.text;
    case "removed":
      if (status === "accepted") {
        return null;
      }
      return block.text;
    case "added":
      if (status === "rejected") {
        return null;
      }
      return block.text;
    case "modified":
      if (status === "rejected") {
        return block.baselineText;
      }
      return block.counterpartyText;
    case "moved":
      if (status === "rejected") {
        return block.baselineText;
      }
      return block.counterpartyText;
    default:
      return null;
  }
}

export function buildCleanDocumentParagraphs(
  alignment: LegalReviewAlignmentBlock[],
  deviations: LegalReviewDeviation[],
): string[] {
  const paragraphs: string[] = [
    paragraph("Clean agreement draft generated from legal review decisions."),
    paragraph(
      "Accepted counterparty changes are retained. Rejected changes revert to the prior version language.",
    ),
  ];

  for (const block of alignment) {
    const deviation = findDeviationForAlignmentBlock(block, deviations);
    const text = resolveBlockText(block, deviation);

    if (text) {
      paragraphs.push(paragraph(text));
    }
  }

  return paragraphs;
}

export async function generateCleanReviewDocx(input: {
  roundNumber: number;
  baselineFileName: string;
  counterpartyFileName: string;
  alignment: LegalReviewAlignmentBlock[];
  deviations: LegalReviewDeviation[];
}): Promise<Buffer> {
  const paragraphs = buildCleanDocumentParagraphs(input.alignment, input.deviations);
  const zip = new JSZip();

  zip.file(
    "[Content_Types].xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`,
  );
  zip.file(
    "_rels/.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`,
  );
  zip.file(
    "word/document.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>${paragraphs.join("")}<w:sectPr/></w:body>
</w:document>`,
  );

  return zip.generateAsync({ type: "nodebuffer" });
}

export function buildCleanReviewFileName(roundNumber: number): string {
  return `legal-review-round-${roundNumber}-clean-draft.docx`;
}
