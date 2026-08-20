import JSZip from "jszip";
import {
  buildDocumentAlignment,
  type RedlineAlignmentBlock,
} from "@/lib/legal-review-comparison";
import { diffWords, type WordDiffPart } from "@/lib/legal-review-text-diff";

export interface GenerateRedlineDocxInput {
  roundNumber: number;
  baselineFileName: string;
  counterpartyFileName: string;
  baselineText: string;
  counterpartyText: string;
  comparisonSummary: string;
  generatedByName: string;
}

function escapeXml(value: string): string {
  return value
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function revisionTimestamp(): string {
  return new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
}

function buildRevisionParagraph(
  parts: WordDiffPart[],
  author: string,
  timestamp: string,
): string {
  const chunks: string[] = [];

  for (const part of parts) {
    if (part.kind === "equal") {
      chunks.push(`<w:r><w:t xml:space="preserve">${escapeXml(part.text)}</w:t></w:r>`);
      continue;
    }

    if (part.kind === "delete") {
      chunks.push(
        `<w:del w:author="${escapeXml(author)}" w:date="${timestamp}"><w:r><w:delText xml:space="preserve">${escapeXml(part.text)}</w:delText></w:r></w:del>`,
      );
      continue;
    }

    chunks.push(
      `<w:ins w:author="${escapeXml(author)}" w:date="${timestamp}"><w:r><w:t xml:space="preserve">${escapeXml(part.text)}</w:t></w:r></w:ins>`,
    );
  }

  return `<w:p>${chunks.join("")}</w:p>`;
}

function buildDeletedParagraph(text: string, author: string, timestamp: string): string {
  return `<w:p><w:del w:author="${escapeXml(author)}" w:date="${timestamp}"><w:r><w:delText xml:space="preserve">${escapeXml(text)}</w:delText></w:r></w:del></w:p>`;
}

function buildInsertedParagraph(text: string, author: string, timestamp: string): string {
  return `<w:p><w:ins w:author="${escapeXml(author)}" w:date="${timestamp}"><w:r><w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r></w:ins></w:p>`;
}

function buildNormalParagraph(text: string): string {
  return `<w:p><w:r><w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r></w:p>`;
}

function buildHeadingParagraph(text: string): string {
  return `<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:rPr><w:b/></w:rPr><w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r></w:p>`;
}

function buildBlockParagraph(
  block: RedlineAlignmentBlock,
  author: string,
  timestamp: string,
): string {
  switch (block.kind) {
    case "unchanged":
      return buildNormalParagraph(block.text);
    case "removed":
      return buildDeletedParagraph(block.text, author, timestamp);
    case "added":
      return buildInsertedParagraph(block.text, author, timestamp);
    case "modified":
      return buildRevisionParagraph(
        diffWords(block.baselineText, block.counterpartyText),
        author,
        timestamp,
      );
    default:
      return "";
  }
}

export function buildRedlineFileName(roundNumber: number): string {
  return `legal-review-round-${roundNumber}-redline.docx`;
}

export async function generateRedlineDocx(
  input: GenerateRedlineDocxInput,
): Promise<Buffer> {
  const author = input.generatedByName || "Legal Review";
  const timestamp = revisionTimestamp();
  const alignment = buildDocumentAlignment({
    baselineText: input.baselineText,
    counterpartyText: input.counterpartyText,
  });

  const paragraphs = [
    buildHeadingParagraph(`Legal Review Redline — Round ${input.roundNumber}`),
    buildNormalParagraph(`Prior version: ${input.baselineFileName}`),
    buildNormalParagraph(`Counterparty version: ${input.counterpartyFileName}`),
    buildNormalParagraph(`Generated: ${new Date().toLocaleString()}`),
    buildNormalParagraph(input.comparisonSummary),
    buildNormalParagraph(
      "Deletions appear as struck-through text. Insertions appear as underlined additions. Modified paragraphs show inline word-level redlines.",
    ),
    buildHeadingParagraph("Redlined agreement text"),
    ...alignment.map((block) => buildBlockParagraph(block, author, timestamp)),
  ];

  const zip = new JSZip();
  zip.file(
    "[Content_Types].xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
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
    "word/_rels/document.xml.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings" Target="settings.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`,
  );
  zip.file(
    "word/settings.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:settings xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:trackRevisions w:val="true"/>
  <w:revisionView w:markup="true" w:insDel="true"/>
</w:settings>`,
  );
  zip.file(
    "word/styles.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:style w:type="paragraph" w:styleId="Heading1">
    <w:name w:val="Heading 1"/>
    <w:rPr><w:b/></w:rPr>
  </w:style>
</w:styles>`,
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
