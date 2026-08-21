import {
  summarizeRunFormatting,
  type StructuredDocument,
  type StructuredDocumentBlock,
  type StructuredFootnoteBlock,
  type StructuredImageBlock,
  type StructuredParagraphBlock,
  type StructuredTableBlock,
} from "@/lib/legal-review-docx-structure";
import type {
  LegalReviewAlignmentBlock,
  LegalReviewDeviation,
  LegalReviewDeviationKind,
  LegalReviewDeviationPriority,
} from "@/types/legal-review";

const STRUCTURAL_DEVIATION_KINDS = new Set<LegalReviewDeviationKind>([
  "formatting_change",
  "table_change",
  "image_change",
  "footnote_change",
]);

export interface StructureComparisonResult {
  deviations: LegalReviewDeviation[];
}

function tokenSimilarity(left: string, right: string): number {
  if (left === right) {
    return 1;
  }

  const leftTokens = new Set(
    left.toLowerCase().split(/[^a-z0-9]+/).filter((token) => token.length > 2),
  );
  const rightTokens = new Set(
    right.toLowerCase().split(/[^a-z0-9]+/).filter((token) => token.length > 2),
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

function blockComparableText(block: StructuredDocumentBlock): string {
  switch (block.kind) {
    case "paragraph":
      return block.text;
    case "table":
      return block.summary;
    case "image":
      return block.description;
    case "footnote":
      return block.text;
    default:
      return "";
  }
}

function createStructuralDeviation(
  kind: LegalReviewDeviationKind,
  title: string,
  summary: string,
  baselineExcerpt: string | null,
  counterpartyExcerpt: string | null,
  priority: LegalReviewDeviationPriority,
  createdAt: string,
): LegalReviewDeviation {
  return {
    id: `dev-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    kind,
    title,
    summary,
    priority,
    status: "open",
    baselineExcerpt,
    counterpartyExcerpt,
    clauseId: null,
    clauseTitle: null,
    approvedClauseText: null,
    createdAt,
  };
}

function compareParagraphFormatting(
  baseline: StructuredParagraphBlock,
  counterparty: StructuredParagraphBlock,
  createdAt: string,
): LegalReviewDeviation | null {
  if (baseline.formattingSignature === counterparty.formattingSignature) {
    return null;
  }

  if (baseline.text.toLowerCase() !== counterparty.text.toLowerCase()) {
    return null;
  }

  const baselineFormatting = baseline.runs
    .map((run) => summarizeRunFormatting(run.formatting))
    .join("; ");
  const counterpartyFormatting = counterparty.runs
    .map((run) => summarizeRunFormatting(run.formatting))
    .join("; ");

  return createStructuralDeviation(
    "formatting_change",
    `Formatting change: ${baseline.text.split(/\s+/).slice(0, 8).join(" ")}`,
    "Text is unchanged but formatting differs between the prior and counterparty versions.",
    `${baseline.text}\nFormatting: ${baselineFormatting || "plain text"}`,
    `${counterparty.text}\nFormatting: ${counterpartyFormatting || "plain text"}`,
    "medium",
    createdAt,
  );
}

function compareTables(
  baseline: StructuredTableBlock,
  counterparty: StructuredTableBlock,
  createdAt: string,
): LegalReviewDeviation | null {
  if (baseline.signature === counterparty.signature) {
    return null;
  }

  const rowChange =
    baseline.rows.length !== counterparty.rows.length
      ? `Row count changed from ${baseline.rows.length} to ${counterparty.rows.length}. `
      : "";

  const changedCells: string[] = [];
  const maxRows = Math.max(baseline.rows.length, counterparty.rows.length);
  const maxCols = Math.max(
    ...baseline.rows.map((row) => row.length),
    ...counterparty.rows.map((row) => row.length),
    0,
  );

  for (let rowIndex = 0; rowIndex < maxRows; rowIndex += 1) {
    for (let colIndex = 0; colIndex < maxCols; colIndex += 1) {
      const left = baseline.rows[rowIndex]?.[colIndex] ?? "";
      const right = counterparty.rows[rowIndex]?.[colIndex] ?? "";
      if (left !== right) {
        changedCells.push(
          `R${rowIndex + 1}C${colIndex + 1}: "${left || "(empty)"}" -> "${right || "(empty)"}"`,
        );
      }
    }
  }

  return createStructuralDeviation(
    "table_change",
    `Table change: ${baseline.rows[0]?.[0]?.split(/\s+/).slice(0, 6).join(" ") ?? "Agreement table"}`,
    `${rowChange}${changedCells.length} cell${changedCells.length === 1 ? "" : "s"} changed in the table.`,
    baseline.summary,
    counterparty.summary,
    /fee|payment|price|amount|\$/i.test(`${baseline.summary} ${counterparty.summary}`)
      ? "high"
      : "medium",
    createdAt,
  );
}

function compareImages(
  baseline: StructuredImageBlock | null,
  counterparty: StructuredImageBlock | null,
  createdAt: string,
): LegalReviewDeviation | null {
  if (!baseline && counterparty) {
    return createStructuralDeviation(
      "image_change",
      `Image inserted: ${counterparty.description}`,
      "Counterparty version includes an embedded image that was not present in the prior version.",
      null,
      counterparty.description,
      "medium",
      createdAt,
    );
  }

  if (baseline && !counterparty) {
    return createStructuralDeviation(
      "image_change",
      `Image removed: ${baseline.description}`,
      "An embedded image from the prior version is missing in the counterparty redline.",
      baseline.description,
      null,
      "medium",
      createdAt,
    );
  }

  if (baseline && counterparty && baseline.signature !== counterparty.signature) {
    return createStructuralDeviation(
      "image_change",
      `Image changed: ${counterparty.description}`,
      "Embedded image metadata or placement changed between versions.",
      baseline.description,
      counterparty.description,
      "medium",
      createdAt,
    );
  }

  return null;
}

function compareFootnotes(
  baseline: StructuredFootnoteBlock[],
  counterparty: StructuredFootnoteBlock[],
  createdAt: string,
): LegalReviewDeviation[] {
  const deviations: LegalReviewDeviation[] = [];
  const usedCounterparty = new Set<string>();

  for (const baselineFootnote of baseline) {
    let bestMatch: StructuredFootnoteBlock | null = null;
    let bestScore = 0;

    for (const counterpartyFootnote of counterparty) {
      if (usedCounterparty.has(counterpartyFootnote.footnoteId)) {
        continue;
      }

      const score = Math.max(
        tokenSimilarity(baselineFootnote.text, counterpartyFootnote.text),
        baselineFootnote.footnoteId === counterpartyFootnote.footnoteId ? 0.75 : 0,
      );

      if (score > bestScore) {
        bestScore = score;
        bestMatch = counterpartyFootnote;
      }
    }

    if (!bestMatch || bestScore < 0.55) {
      deviations.push(
        createStructuralDeviation(
          "footnote_change",
          `Footnote removed: ${baselineFootnote.text.split(/\s+/).slice(0, 8).join(" ")}`,
          "A footnote from the prior version is missing in the counterparty redline.",
          `${baselineFootnote.marker} ${baselineFootnote.text}`,
          null,
          "medium",
          createdAt,
        ),
      );
      continue;
    }

    usedCounterparty.add(bestMatch.footnoteId);

    if (bestMatch.text !== baselineFootnote.text) {
      deviations.push(
        createStructuralDeviation(
          "footnote_change",
          `Footnote modified: ${bestMatch.text.split(/\s+/).slice(0, 8).join(" ")}`,
          "Footnote text changed between the prior and counterparty versions.",
          `${baselineFootnote.marker} ${baselineFootnote.text}`,
          `${bestMatch.marker} ${bestMatch.text}`,
          "medium",
          createdAt,
        ),
      );
    }
  }

  for (const counterpartyFootnote of counterparty) {
    if (usedCounterparty.has(counterpartyFootnote.footnoteId)) {
      continue;
    }

    deviations.push(
      createStructuralDeviation(
        "footnote_change",
        `Footnote added: ${counterpartyFootnote.text.split(/\s+/).slice(0, 8).join(" ")}`,
        "Counterparty version includes a new footnote that was not present in the prior version.",
        null,
        `${counterpartyFootnote.marker} ${counterpartyFootnote.text}`,
        "medium",
        createdAt,
      ),
    );
  }

  return deviations;
}

function matchBlocksByKind<T extends StructuredDocumentBlock>(
  baselineBlocks: T[],
  counterpartyBlocks: T[],
  minScore: number,
): Array<{ baseline: T; counterparty: T }> {
  const pairs: Array<{ baseline: T; counterparty: T }> = [];
  const usedCounterparty = new Set<number>();

  for (const baselineBlock of baselineBlocks) {
    let bestIndex = -1;
    let bestScore = 0;

    for (let index = 0; index < counterpartyBlocks.length; index += 1) {
      if (usedCounterparty.has(index)) {
        continue;
      }

      const score = tokenSimilarity(
        blockComparableText(baselineBlock),
        blockComparableText(counterpartyBlocks[index]!),
      );

      if (score > bestScore) {
        bestScore = score;
        bestIndex = index;
      }
    }

    if (bestIndex !== -1 && bestScore >= minScore) {
      usedCounterparty.add(bestIndex);
      pairs.push({
        baseline: baselineBlock,
        counterparty: counterpartyBlocks[bestIndex]!,
      });
    }
  }

  return pairs;
}

function excerptOverlapsExisting(
  deviation: LegalReviewDeviation,
  existing: LegalReviewDeviation[],
): boolean {
  const left = `${deviation.baselineExcerpt ?? ""} ${deviation.counterpartyExcerpt ?? ""}`.toLowerCase();

  return existing.some((item) => {
    if (item.id === deviation.id) {
      return false;
    }

    const right = `${item.baselineExcerpt ?? ""} ${item.counterpartyExcerpt ?? ""}`.toLowerCase();
    return tokenSimilarity(left, right) >= 0.88;
  });
}

function tableChangeCoveredByTextDeviation(
  deviation: LegalReviewDeviation,
  existing: LegalReviewDeviation[],
): boolean {
  if (
    deviation.kind !== "table_change" ||
    !deviation.baselineExcerpt ||
    !deviation.counterpartyExcerpt
  ) {
    return false;
  }

  const baselineNumbers =
    deviation.baselineExcerpt.match(/\d[\d,]*/g)?.filter(Boolean) ?? [];
  const counterpartyNumbers =
    deviation.counterpartyExcerpt.match(/\d[\d,]*/g)?.filter(Boolean) ?? [];
  const changedNumbers = baselineNumbers.filter(
    (value) => !counterpartyNumbers.includes(value),
  );

  if (changedNumbers.length === 0) {
    return false;
  }

  return existing.some((item) => {
    if (item.kind !== "modified" || !item.baselineExcerpt || !item.counterpartyExcerpt) {
      return false;
    }

    return changedNumbers.every(
      (value) =>
        item.baselineExcerpt!.includes(value) &&
        !item.counterpartyExcerpt!.includes(value),
    );
  });
}

export function compareDocumentStructures(
  baseline: StructuredDocument | null,
  counterparty: StructuredDocument | null,
  existingDeviations: LegalReviewDeviation[] = [],
): StructureComparisonResult {
  if (!baseline || !counterparty) {
    return { deviations: [] };
  }

  const createdAt = new Date().toISOString();
  const deviations: LegalReviewDeviation[] = [];

  const baselineParagraphs = baseline.blocks.filter(
    (block): block is StructuredParagraphBlock => block.kind === "paragraph",
  );
  const counterpartyParagraphs = counterparty.blocks.filter(
    (block): block is StructuredParagraphBlock => block.kind === "paragraph",
  );

  for (const pair of matchBlocksByKind(baselineParagraphs, counterpartyParagraphs, 0.95)) {
    const deviation = compareParagraphFormatting(pair.baseline, pair.counterparty, createdAt);
    if (deviation) {
      deviations.push(deviation);
    }
  }

  const baselineTables = baseline.blocks.filter(
    (block): block is StructuredTableBlock => block.kind === "table",
  );
  const counterpartyTables = counterparty.blocks.filter(
    (block): block is StructuredTableBlock => block.kind === "table",
  );

  for (let index = 0; index < Math.max(baselineTables.length, counterpartyTables.length); index += 1) {
    const left = baselineTables[index];
    const right = counterpartyTables[index];

    if (left && right) {
      const deviation = compareTables(left, right, createdAt);
      if (deviation) {
        deviations.push(deviation);
      }
      continue;
    }

    if (left) {
      deviations.push(
        createStructuralDeviation(
          "table_change",
          "Table removed from counterparty version",
          "A table present in the prior version is missing from the counterparty redline.",
          left.summary,
          null,
          "high",
          createdAt,
        ),
      );
    }

    if (right) {
      deviations.push(
        createStructuralDeviation(
          "table_change",
          "Table added in counterparty version",
          "Counterparty version includes a table that was not present in the prior version.",
          null,
          right.summary,
          "high",
          createdAt,
        ),
      );
    }
  }

  const baselineImages = baseline.blocks.filter(
    (block): block is StructuredImageBlock => block.kind === "image",
  );
  const counterpartyImages = counterparty.blocks.filter(
    (block): block is StructuredImageBlock => block.kind === "image",
  );

  for (let index = 0; index < Math.max(baselineImages.length, counterpartyImages.length); index += 1) {
    const deviation = compareImages(
      baselineImages[index] ?? null,
      counterpartyImages[index] ?? null,
      createdAt,
    );
    if (deviation) {
      deviations.push(deviation);
    }
  }

  deviations.push(...compareFootnotes(baseline.footnotes, counterparty.footnotes, createdAt));

  const deduped: LegalReviewDeviation[] = [];
  for (const deviation of deviations) {
    if (
      excerptOverlapsExisting(deviation, [...existingDeviations, ...deduped]) ||
      tableChangeCoveredByTextDeviation(deviation, existingDeviations)
    ) {
      continue;
    }

    deduped.push(deviation);
  }

  return { deviations: deduped };
}

export function buildStructuralAlignmentBlocks(
  deviations: LegalReviewDeviation[],
): LegalReviewAlignmentBlock[] {
  const blocks: LegalReviewAlignmentBlock[] = [];

  for (const deviation of deviations) {
    if (!STRUCTURAL_DEVIATION_KINDS.has(deviation.kind)) {
      continue;
    }

    if (deviation.baselineExcerpt && deviation.counterpartyExcerpt) {
      blocks.push({
        kind: "modified",
        baselineText: deviation.baselineExcerpt,
        counterpartyText: deviation.counterpartyExcerpt,
      });
      continue;
    }

    if (deviation.baselineExcerpt) {
      blocks.push({ kind: "removed", text: deviation.baselineExcerpt });
      continue;
    }

    if (deviation.counterpartyExcerpt) {
      blocks.push({ kind: "added", text: deviation.counterpartyExcerpt });
    }
  }

  return blocks;
}
