import type { RedlineAlignmentBlock } from "@/lib/legal-review-comparison";
import type {
  RunFormatting,
  StructuredDocument,
  StructuredParagraphBlock,
  StructuredParagraphRun,
} from "@/lib/legal-review-docx-structure";
import { diffWords } from "@/lib/legal-review-text-diff";

export const DEFAULT_RUN_FORMATTING: RunFormatting = {
  bold: false,
  italic: false,
  underline: false,
  strike: false,
  allCaps: false,
  highlight: null,
};

function normalizeMatchText(text: string): string {
  return text.replace(/\s+/g, " ").trim().toLowerCase();
}

function tokenSimilarity(left: string, right: string): number {
  if (left === right) {
    return 1;
  }

  const leftTokens = new Set(
    left.split(/[^a-z0-9]+/).filter((token) => token.length > 2),
  );
  const rightTokens = new Set(
    right.split(/[^a-z0-9]+/).filter((token) => token.length > 2),
  );

  if (leftTokens.size === 0 || rightTokens.size === 0) {
    return 0;
  }

  let intersection = 0;
  for (const token of leftTokens) {
    if (rightTokens.has(token)) {
      intersection += 1;
    }
  }

  return intersection / new Set([...leftTokens, ...rightTokens]).size;
}

export function findMatchingParagraphBlock(
  structure: StructuredDocument | null | undefined,
  text: string,
): StructuredParagraphBlock | null {
  if (!structure) {
    return null;
  }

  const target = normalizeMatchText(text);
  if (!target) {
    return null;
  }

  const paragraphs = structure.blocks.filter(
    (block): block is StructuredParagraphBlock => block.kind === "paragraph",
  );

  for (const paragraph of paragraphs) {
    if (normalizeMatchText(paragraph.text) === target) {
      return paragraph;
    }
  }

  let bestMatch: StructuredParagraphBlock | null = null;
  let bestScore = 0;

  for (const paragraph of paragraphs) {
    const score = tokenSimilarity(normalizeMatchText(paragraph.text), target);
    if (score > bestScore) {
      bestScore = score;
      bestMatch = paragraph;
    }
  }

  return bestScore >= 0.88 ? bestMatch : null;
}

function escapeXmlAttribute(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}

export function buildRunPropertiesXml(formatting: RunFormatting): string {
  const properties: string[] = [];

  if (formatting.bold) {
    properties.push("<w:b/>");
  }
  if (formatting.italic) {
    properties.push("<w:i/>");
  }
  if (formatting.underline) {
    properties.push('<w:u w:val="single"/>');
  }
  if (formatting.strike) {
    properties.push("<w:strike/>");
  }
  if (formatting.allCaps) {
    properties.push("<w:caps/>");
  }
  if (formatting.highlight) {
    properties.push(
      `<w:highlight w:val="${escapeXmlAttribute(formatting.highlight)}"/>`,
    );
  }

  if (properties.length === 0) {
    return "";
  }

  return `<w:rPr>${properties.join("")}</w:rPr>`;
}

function expandRunsToCharFormatting(
  runs: StructuredParagraphRun[],
): RunFormatting[] {
  const formatting: RunFormatting[] = [];

  for (const run of runs) {
    for (let index = 0; index < run.text.length; index += 1) {
      formatting.push(run.formatting);
    }
  }

  return formatting;
}

function buildRunFormattingMap(
  runs: StructuredParagraphRun[],
  targetText: string,
): RunFormatting[] {
  const expanded = expandRunsToCharFormatting(runs);

  if (expanded.length === targetText.length) {
    return expanded;
  }

  if (expanded.length === 0 || targetText.length === 0) {
    return Array.from({ length: targetText.length }, () => DEFAULT_RUN_FORMATTING);
  }

  return Array.from({ length: targetText.length }, (_, index) => {
    const mappedIndex = Math.min(
      Math.floor((index / Math.max(targetText.length - 1, 1)) * (expanded.length - 1)),
      expanded.length - 1,
    );
    return expanded[mappedIndex] ?? DEFAULT_RUN_FORMATTING;
  });
}

function formattingAt(
  map: RunFormatting[],
  index: number,
): RunFormatting {
  if (map.length === 0) {
    return DEFAULT_RUN_FORMATTING;
  }

  return map[Math.min(Math.max(index, 0), map.length - 1)] ?? DEFAULT_RUN_FORMATTING;
}

function syntheticRuns(text: string): StructuredParagraphRun[] {
  if (!text) {
    return [];
  }

  return [{ text, formatting: DEFAULT_RUN_FORMATTING }];
}

export function buildFormattedTextRun(
  text: string,
  formatting: RunFormatting,
  escapeXml: (value: string) => string,
): string {
  if (!text) {
    return "";
  }

  const properties = buildRunPropertiesXml(formatting);
  return `<w:r>${properties}<w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r>`;
}

export function buildFormattedDeleteRun(
  text: string,
  formatting: RunFormatting,
  author: string,
  timestamp: string,
  escapeXml: (value: string) => string,
): string {
  if (!text) {
    return "";
  }

  const properties = buildRunPropertiesXml(formatting);
  return `<w:del w:author="${escapeXml(author)}" w:date="${timestamp}"><w:r>${properties}<w:delText xml:space="preserve">${escapeXml(text)}</w:delText></w:r></w:del>`;
}

export function buildFormattedInsertRun(
  text: string,
  formatting: RunFormatting,
  author: string,
  timestamp: string,
  escapeXml: (value: string) => string,
): string {
  if (!text) {
    return "";
  }

  const properties = buildRunPropertiesXml(formatting);
  return `<w:ins w:author="${escapeXml(author)}" w:date="${timestamp}"><w:r>${properties}<w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r></w:ins>`;
}

function buildFormattedRunsParagraph(
  runs: StructuredParagraphRun[],
  escapeXml: (value: string) => string,
): string {
  const chunks = runs.map((run) =>
    buildFormattedTextRun(run.text, run.formatting, escapeXml),
  );
  return `<w:p>${chunks.join("")}</w:p>`;
}

function buildFormattedRevisionParagraph(
  baselineRuns: StructuredParagraphRun[],
  counterpartyRuns: StructuredParagraphRun[],
  baselineText: string,
  counterpartyText: string,
  author: string,
  timestamp: string,
  escapeXml: (value: string) => string,
): string {
  const parts = diffWords(baselineText, counterpartyText);
  const baselineFormats = buildRunFormattingMap(baselineRuns, baselineText);
  const counterpartyFormats = buildRunFormattingMap(counterpartyRuns, counterpartyText);
  let baselineIndex = 0;
  let counterpartyIndex = 0;
  const chunks: string[] = [];

  for (const part of parts) {
    if (part.kind === "equal") {
      chunks.push(
        buildFormattedTextRun(
          part.text,
          formattingAt(baselineFormats, baselineIndex),
          escapeXml,
        ),
      );
      baselineIndex += part.text.length;
      counterpartyIndex += part.text.length;
      continue;
    }

    if (part.kind === "delete") {
      chunks.push(
        buildFormattedDeleteRun(
          part.text,
          formattingAt(baselineFormats, baselineIndex),
          author,
          timestamp,
          escapeXml,
        ),
      );
      baselineIndex += part.text.length;
      continue;
    }

    chunks.push(
      buildFormattedInsertRun(
        part.text,
        formattingAt(counterpartyFormats, counterpartyIndex),
        author,
        timestamp,
        escapeXml,
      ),
    );
    counterpartyIndex += part.text.length;
  }

  return `<w:p>${chunks.join("")}</w:p>`;
}

function buildFormattedDeletedParagraph(
  runs: StructuredParagraphRun[],
  author: string,
  timestamp: string,
  escapeXml: (value: string) => string,
  note?: string,
): string {
  const prefix = note
    ? `<w:r><w:rPr><w:i/></w:rPr><w:t xml:space="preserve">${escapeXml(note)} </w:t></w:r>`
    : "";
  const deletedRuns = runs
    .map((run) =>
      buildFormattedDeleteRun(
        run.text,
        run.formatting,
        author,
        timestamp,
        escapeXml,
      ),
    )
    .join("");

  return `<w:p>${prefix}${deletedRuns}</w:p>`;
}

function buildFormattedInsertedParagraph(
  runs: StructuredParagraphRun[],
  author: string,
  timestamp: string,
  escapeXml: (value: string) => string,
  note?: string,
): string {
  const prefix = note
    ? `<w:r><w:rPr><w:i/></w:rPr><w:t xml:space="preserve">${escapeXml(note)} </w:t></w:r>`
    : "";
  const insertedRuns = runs
    .map((run) =>
      buildFormattedInsertRun(
        run.text,
        run.formatting,
        author,
        timestamp,
        escapeXml,
      ),
    )
    .join("");

  return `<w:p>${prefix}${insertedRuns}</w:p>`;
}

function buildFormattingChangeParagraph(
  baselineRuns: StructuredParagraphRun[],
  counterpartyRuns: StructuredParagraphRun[],
  author: string,
  timestamp: string,
  escapeXml: (value: string) => string,
): string {
  const deletedRuns = baselineRuns
    .map((run) =>
      buildFormattedDeleteRun(
        run.text,
        run.formatting,
        author,
        timestamp,
        escapeXml,
      ),
    )
    .join("");
  const insertedRuns = counterpartyRuns
    .map((run) =>
      buildFormattedInsertRun(
        run.text,
        run.formatting,
        author,
        timestamp,
        escapeXml,
      ),
    )
    .join("");

  return `<w:p>${deletedRuns}${insertedRuns}</w:p>`;
}

export function buildFormattedBlockParagraph(
  block: RedlineAlignmentBlock,
  baselineStructure: StructuredDocument | null | undefined,
  counterpartyStructure: StructuredDocument | null | undefined,
  author: string,
  timestamp: string,
  escapeXml: (value: string) => string,
): string | null {
  switch (block.kind) {
    case "unchanged": {
      const baselineParagraph = findMatchingParagraphBlock(
        baselineStructure,
        block.text,
      );
      const counterpartyParagraph =
        findMatchingParagraphBlock(counterpartyStructure, block.text) ??
        baselineParagraph;

      if (
        baselineParagraph &&
        counterpartyParagraph &&
        normalizeMatchText(baselineParagraph.text) ===
          normalizeMatchText(counterpartyParagraph.text) &&
        baselineParagraph.formattingSignature !==
          counterpartyParagraph.formattingSignature
      ) {
        return buildFormattingChangeParagraph(
          baselineParagraph.runs,
          counterpartyParagraph.runs,
          author,
          timestamp,
          escapeXml,
        );
      }

      const paragraph = counterpartyParagraph ?? baselineParagraph;
      if (!paragraph) {
        return null;
      }
      return buildFormattedRunsParagraph(paragraph.runs, escapeXml);
    }
    case "removed": {
      const paragraph = findMatchingParagraphBlock(baselineStructure, block.text);
      if (!paragraph) {
        return null;
      }
      return buildFormattedDeletedParagraph(
        paragraph.runs,
        author,
        timestamp,
        escapeXml,
        block.movedTo ? "[Relocated section removed from prior position]" : undefined,
      );
    }
    case "added": {
      const paragraph = findMatchingParagraphBlock(counterpartyStructure, block.text);
      if (!paragraph) {
        return null;
      }
      return buildFormattedInsertedParagraph(
        paragraph.runs,
        author,
        timestamp,
        escapeXml,
        block.movedFrom ? "[Relocated section inserted at new position]" : undefined,
      );
    }
    case "modified": {
      const baselineParagraph = findMatchingParagraphBlock(
        baselineStructure,
        block.baselineText,
      );
      const counterpartyParagraph = findMatchingParagraphBlock(
        counterpartyStructure,
        block.counterpartyText,
      );

      if (!baselineParagraph && !counterpartyParagraph) {
        return null;
      }

      return buildFormattedRevisionParagraph(
        baselineParagraph?.runs ?? syntheticRuns(block.baselineText),
        counterpartyParagraph?.runs ?? syntheticRuns(block.counterpartyText),
        block.baselineText,
        block.counterpartyText,
        author,
        timestamp,
        escapeXml,
      );
    }
    case "moved": {
      const baselineParagraph = findMatchingParagraphBlock(
        baselineStructure,
        block.baselineText,
      );
      const counterpartyParagraph = findMatchingParagraphBlock(
        counterpartyStructure,
        block.counterpartyText,
      );

      if (!baselineParagraph && !counterpartyParagraph) {
        return null;
      }

      const deleted = baselineParagraph
        ? buildFormattedDeletedParagraph(
            baselineParagraph.runs,
            author,
            timestamp,
            escapeXml,
            "[Relocated section removed from prior position]",
          )
        : buildFormattedDeletedParagraph(
            syntheticRuns(block.baselineText),
            author,
            timestamp,
            escapeXml,
            "[Relocated section removed from prior position]",
          );
      const inserted = counterpartyParagraph
        ? buildFormattedInsertedParagraph(
            counterpartyParagraph.runs,
            author,
            timestamp,
            escapeXml,
            "[Relocated section inserted at new position]",
          )
        : buildFormattedInsertedParagraph(
            syntheticRuns(block.counterpartyText),
            author,
            timestamp,
            escapeXml,
            "[Relocated section inserted at new position]",
          );

      return deleted + inserted;
    }
    default:
      return null;
  }
}
