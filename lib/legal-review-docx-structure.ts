import JSZip from "jszip";

export interface RunFormatting {
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strike: boolean;
  allCaps: boolean;
  highlight: string | null;
}

export interface StructuredParagraphRun {
  text: string;
  formatting: RunFormatting;
}

export interface StructuredParagraphBlock {
  kind: "paragraph";
  text: string;
  runs: StructuredParagraphRun[];
  formattingSignature: string;
}

export interface StructuredTableBlock {
  kind: "table";
  rows: string[][];
  summary: string;
  signature: string;
}

export interface StructuredImageBlock {
  kind: "image";
  description: string;
  relationshipId: string | null;
  signature: string;
}

export interface StructuredFootnoteBlock {
  kind: "footnote";
  footnoteId: string;
  marker: string;
  text: string;
  signature: string;
}

export type StructuredDocumentBlock =
  | StructuredParagraphBlock
  | StructuredTableBlock
  | StructuredImageBlock
  | StructuredFootnoteBlock;

export interface StructuredDocument {
  blocks: StructuredDocumentBlock[];
  footnotes: StructuredFootnoteBlock[];
}

function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function readTagAttribute(tag: string, attribute: string): string | null {
  const pattern = new RegExp(`${attribute}="([^"]+)"`);
  return tag.match(pattern)?.[1] ?? null;
}

function extractBalancedElement(
  xml: string,
  startIndex: number,
  localName: string,
): { xml: string; endIndex: number } | null {
  const openPrefix = `<w:${localName}`;
  if (!xml.startsWith(openPrefix, startIndex)) {
    return null;
  }

  const openEnd = xml.indexOf(">", startIndex);
  if (openEnd === -1) {
    return null;
  }

  if (xml.slice(startIndex, openEnd + 1).endsWith("/>")) {
    return {
      xml: xml.slice(startIndex, openEnd + 1),
      endIndex: openEnd + 1,
    };
  }

  let depth = 1;
  let cursor = openEnd + 1;
  const openTag = new RegExp(`<w:${localName}(\\s|>)`, "g");
  const closeTag = `<\/w:${localName}>`;

  while (cursor < xml.length && depth > 0) {
    const nextOpen = xml.indexOf(`<w:${localName}`, cursor);
    const nextClose = xml.indexOf(closeTag, cursor);

    if (nextClose === -1) {
      return null;
    }

    if (nextOpen !== -1 && nextOpen < nextClose) {
      const tagEnd = xml.indexOf(">", nextOpen);
      if (tagEnd !== -1 && !xml.slice(nextOpen, tagEnd + 1).endsWith("/>")) {
        depth += 1;
      }
      cursor = tagEnd + 1;
      continue;
    }

    depth -= 1;
    cursor = nextClose + closeTag.length;
  }

  return {
    xml: xml.slice(startIndex, cursor),
    endIndex: cursor,
  };
}

function parseRunFormatting(runXml: string): RunFormatting {
  const properties = runXml.match(/<w:rPr>([\s\S]*?)<\/w:rPr>/)?.[1] ?? "";

  return {
    bold: /<w:b(?:\s|\/|>)/.test(properties),
    italic: /<w:i(?:\s|\/|>)/.test(properties),
    underline: /<w:u(?:\s|\/|>)/.test(properties),
    strike: /<w:strike(?:\s|\/|>)/.test(properties),
    allCaps: /<w:caps(?:\s|\/|>)/.test(properties),
    highlight: properties.match(/<w:highlight w:val="([^"]+)"/)?.[1] ?? null,
  };
}

function extractRunTexts(runXml: string): string {
  const parts: string[] = [];
  const textPattern = /<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g;

  for (const match of runXml.matchAll(textPattern)) {
    parts.push(match[1] ?? "");
  }

  const delPattern = /<w:delText(?:\s[^>]*)?>([\s\S]*?)<\/w:delText>/g;
  for (const match of runXml.matchAll(delPattern)) {
    parts.push(match[1] ?? "");
  }

  return parts.join("");
}

function buildFormattingSignature(runs: StructuredParagraphRun[]): string {
  return runs
    .map((run) => {
      const flags = [
        run.formatting.bold ? "b" : "",
        run.formatting.italic ? "i" : "",
        run.formatting.underline ? "u" : "",
        run.formatting.strike ? "s" : "",
        run.formatting.allCaps ? "c" : "",
        run.formatting.highlight ? `h:${run.formatting.highlight}` : "",
      ].join("");

      return `${flags}:${normalizeWhitespace(run.text).toLowerCase()}`;
    })
    .join("|");
}

function parseParagraphBlock(paragraphXml: string): StructuredParagraphBlock | null {
  const runs: StructuredParagraphRun[] = [];
  let cursor = 0;

  while (cursor < paragraphXml.length) {
    const runElement = extractBalancedElement(paragraphXml, cursor, "r");
    if (!runElement) {
      cursor += 1;
      continue;
    }

    const text = extractRunTexts(runElement.xml);
    if (text.length > 0) {
      runs.push({
        text,
        formatting: parseRunFormatting(runElement.xml),
      });
    }

    cursor = runElement.endIndex;
  }

  const text = normalizeWhitespace(runs.map((run) => run.text).join(" "));
  if (text.length === 0) {
    return null;
  }

  return {
    kind: "paragraph",
    text,
    runs,
    formattingSignature: buildFormattingSignature(runs),
  };
}

function parseTableBlock(tableXml: string): StructuredTableBlock | null {
  const rows: string[][] = [];
  let cursor = 0;

  while (cursor < tableXml.length) {
    const rowElement = extractBalancedElement(tableXml, cursor, "tr");
    if (!rowElement) {
      cursor += 1;
      continue;
    }

    const cells: string[] = [];
    let cellCursor = 0;

    while (cellCursor < rowElement.xml.length) {
      const cellElement = extractBalancedElement(rowElement.xml, cellCursor, "tc");
      if (!cellElement) {
        cellCursor += 1;
        continue;
      }

      const cellText: string[] = [];
      let paragraphCursor = 0;

      while (paragraphCursor < cellElement.xml.length) {
        const paragraphElement = extractBalancedElement(
          cellElement.xml,
          paragraphCursor,
          "p",
        );
        if (!paragraphElement) {
          paragraphCursor += 1;
          continue;
        }

        const paragraph = parseParagraphBlock(paragraphElement.xml);
        if (paragraph?.text) {
          cellText.push(paragraph.text);
        }

        paragraphCursor = paragraphElement.endIndex;
      }

      cells.push(normalizeWhitespace(cellText.join(" ")));
      cellCursor = cellElement.endIndex;
    }

    if (cells.length > 0) {
      rows.push(cells);
    }

    cursor = rowElement.endIndex;
  }

  if (rows.length === 0) {
    return null;
  }

  const summary = rows
    .map((row, rowIndex) => `Row ${rowIndex + 1}: ${row.join(" | ")}`)
    .join("\n");

  return {
    kind: "table",
    rows,
    summary,
    signature: rows.map((row) => row.join("\t")).join("\n"),
  };
}

function parseImageBlockFromDrawing(drawingXml: string): StructuredImageBlock | null {
  const relationshipId =
    drawingXml.match(/r:embed="([^"]+)"/)?.[1] ??
    drawingXml.match(/r:link="([^"]+)"/)?.[1] ??
    null;
  const description =
    normalizeWhitespace(
      drawingXml.match(/<wp:docPr[^>]*descr="([^"]*)"/)?.[1] ??
        drawingXml.match(/<wp:docPr[^>]*name="([^"]*)"/)?.[1] ??
        "",
    ) || "Embedded image";

  return {
    kind: "image",
    description,
    relationshipId,
    signature: `${relationshipId ?? "inline"}:${description.toLowerCase()}`,
  };
}

function parseFootnotesXml(footnotesXml: string | undefined): StructuredFootnoteBlock[] {
  if (!footnotesXml) {
    return [];
  }

  const footnotes: StructuredFootnoteBlock[] = [];
  let cursor = 0;

  while (cursor < footnotesXml.length) {
    const footnoteElement = extractBalancedElement(footnotesXml, cursor, "footnote");
    if (!footnoteElement) {
      cursor += 1;
      continue;
    }

    const footnoteId = readTagAttribute(footnoteElement.xml, "w:id");
    if (!footnoteId || footnoteId === "-1" || footnoteId === "0") {
      cursor = footnoteElement.endIndex;
      continue;
    }

    const paragraph = parseParagraphBlock(footnoteElement.xml);
    if (paragraph?.text) {
      footnotes.push({
        kind: "footnote",
        footnoteId,
        marker: `[${footnoteId}]`,
        text: paragraph.text,
        signature: `${footnoteId}:${paragraph.text.toLowerCase()}`,
      });
    }

    cursor = footnoteElement.endIndex;
  }

  return footnotes;
}

function parseBodyBlocks(bodyXml: string): StructuredDocumentBlock[] {
  const blocks: StructuredDocumentBlock[] = [];
  let cursor = 0;

  while (cursor < bodyXml.length) {
    if (bodyXml.startsWith("<w:tbl", cursor)) {
      const tableElement = extractBalancedElement(bodyXml, cursor, "tbl");
      if (tableElement) {
        const table = parseTableBlock(tableElement.xml);
        if (table) {
          blocks.push(table);
        }
        cursor = tableElement.endIndex;
        continue;
      }
    }

    if (bodyXml.startsWith("<w:p", cursor)) {
      const paragraphElement = extractBalancedElement(bodyXml, cursor, "p");
      if (paragraphElement) {
        if (paragraphElement.xml.includes("<w:drawing")) {
          const drawingMatch = paragraphElement.xml.match(/<w:drawing>[\s\S]*?<\/w:drawing>/);
          if (drawingMatch) {
            const image = parseImageBlockFromDrawing(drawingMatch[0]!);
            if (image) {
              blocks.push(image);
            }
          }
        }

        const paragraph = parseParagraphBlock(paragraphElement.xml);
        if (paragraph) {
          blocks.push(paragraph);
        }

        cursor = paragraphElement.endIndex;
        continue;
      }
    }

    cursor += 1;
  }

  return blocks;
}

export async function extractDocxStructure(
  buffer: Buffer,
  fileName: string,
): Promise<StructuredDocument | null> {
  const extension = fileName.split(".").pop()?.toLowerCase() ?? "";
  if (extension !== "docx") {
    return null;
  }

  const zip = await JSZip.loadAsync(buffer);
  const documentXml = await zip.file("word/document.xml")?.async("string");
  if (!documentXml) {
    return null;
  }

  const footnotesXml = await zip.file("word/footnotes.xml")?.async("string");
  const bodyMatch = documentXml.match(/<w:body>([\s\S]*?)<\/w:body>/);
  if (!bodyMatch) {
    return null;
  }

  return {
    blocks: parseBodyBlocks(bodyMatch[1]!),
    footnotes: parseFootnotesXml(footnotesXml),
  };
}

export function summarizeRunFormatting(formatting: RunFormatting): string {
  const parts = [
    formatting.bold ? "bold" : null,
    formatting.italic ? "italic" : null,
    formatting.underline ? "underline" : null,
    formatting.strike ? "strikethrough" : null,
    formatting.allCaps ? "all caps" : null,
    formatting.highlight ? `${formatting.highlight} highlight` : null,
  ].filter(Boolean);

  return parts.length > 0 ? parts.join(", ") : "plain text";
}
