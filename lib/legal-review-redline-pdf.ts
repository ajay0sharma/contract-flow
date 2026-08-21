import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import type { LegalReviewAlignmentBlock } from "@/types/legal-review";

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const MARGIN = 50;
const LINE_HEIGHT = 14;
const FONT_SIZE = 10;

function wrapText(text: string, maxWidth: number, font: Awaited<ReturnType<PDFDocument["embedFont"]>>): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    const width = font.widthOfTextAtSize(candidate, FONT_SIZE);

    if (width > maxWidth && current) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }

  if (current) {
    lines.push(current);
  }

  return lines.length > 0 ? lines : [""];
}

async function drawWrappedText(options: {
  page: ReturnType<PDFDocument["addPage"]>;
  font: Awaited<ReturnType<PDFDocument["embedFont"]>>;
  text: string;
  x: number;
  y: number;
  maxWidth: number;
  color?: ReturnType<typeof rgb>;
}): Promise<number> {
  let cursorY = options.y;
  const lines = wrapText(options.text, options.maxWidth, options.font);

  for (const line of lines) {
    options.page.drawText(line, {
      x: options.x,
      y: cursorY,
      size: FONT_SIZE,
      font: options.font,
      color: options.color ?? rgb(0.1, 0.1, 0.1),
    });
    cursorY -= LINE_HEIGHT;
  }

  return cursorY;
}

function blockPlainText(block: LegalReviewAlignmentBlock): string {
  switch (block.kind) {
    case "unchanged":
      return block.text;
    case "removed":
      return `[DELETED] ${block.text}`;
    case "added":
      return `[INSERTED] ${block.text}`;
    case "modified":
      return `[MODIFIED] ${block.baselineText} => ${block.counterpartyText}`;
    case "moved":
      return `[RELOCATED] ${block.baselineText} => ${block.counterpartyText}`;
    default:
      return "";
  }
}

export async function generateRedlinePdf(input: {
  roundNumber: number;
  baselineFileName: string;
  counterpartyFileName: string;
  comparisonSummary: string;
  alignment: LegalReviewAlignmentBlock[];
}): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const maxWidth = PAGE_WIDTH - MARGIN * 2;

  let page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let y = PAGE_HEIGHT - MARGIN;

  const ensureSpace = (linesNeeded: number): void => {
    if (y - linesNeeded * LINE_HEIGHT < MARGIN) {
      page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      y = PAGE_HEIGHT - MARGIN;
    }
  };

  page.drawText(`Legal Review Redline — Round ${input.roundNumber}`, {
    x: MARGIN,
    y,
    size: 14,
    font: bold,
  });
  y -= LINE_HEIGHT * 2;

  for (const line of [
    `Prior version: ${input.baselineFileName}`,
    `Counterparty version: ${input.counterpartyFileName}`,
    `Summary: ${input.comparisonSummary}`,
  ]) {
    ensureSpace(2);
    y = await drawWrappedText({ page, font: regular, text: line, x: MARGIN, y, maxWidth });
    y -= 6;
  }

  y -= LINE_HEIGHT;
  ensureSpace(2);
  page.drawText("Redlined agreement text", {
    x: MARGIN,
    y,
    size: 12,
    font: bold,
  });
  y -= LINE_HEIGHT * 1.5;

  for (const block of input.alignment) {
    const text = blockPlainText(block);
    const lines = wrapText(text, maxWidth, regular);
    ensureSpace(lines.length + 1);
    y = await drawWrappedText({
      page,
      font: regular,
      text,
      x: MARGIN,
      y,
      maxWidth,
      color:
        block.kind === "removed"
          ? rgb(0.71, 0.14, 0.09)
          : block.kind === "added"
            ? rgb(0.01, 0.48, 0.28)
            : block.kind === "modified" || block.kind === "moved"
              ? rgb(0.12, 0.25, 0.69)
              : rgb(0.1, 0.1, 0.1),
    });
    y -= 8;
  }

  const bytes = await pdf.save();
  return Buffer.from(bytes);
}

export function buildRedlinePdfFileName(roundNumber: number): string {
  return `legal-review-round-${roundNumber}-redline.pdf`;
}
