import {
  blocksAreEquivalent,
  summarizeMaterialChange,
} from "@/lib/legal-review-text-diff";
import type {
  LegalReviewDeviation,
  LegalReviewDeviationKind,
  LegalReviewDeviationPriority,
} from "@/types/legal-review";

export interface DocumentComparisonInput {
  baselineText: string;
  counterpartyText: string;
}

export interface DocumentComparisonResult {
  deviations: LegalReviewDeviation[];
  summary: string;
}

export type RedlineAlignmentBlock =
  | { kind: "unchanged"; text: string }
  | { kind: "removed"; text: string }
  | { kind: "added"; text: string }
  | { kind: "modified"; baselineText: string; counterpartyText: string };

interface TextBlock {
  index: number;
  text: string;
  normalized: string;
}

function splitIntoBlocks(text: string): TextBlock[] {
  return text
    .split(/\n\s*\n/)
    .map((entry) => entry.replace(/\s+/g, " ").trim())
    .filter((entry) => entry.length >= 12)
    .map((entry, index) => ({
      index,
      text: entry,
      normalized: entry.toLowerCase(),
    }));
}

function tokenSet(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((token) => token.length > 2),
  );
}

function similarity(left: string, right: string): number {
  if (left === right) {
    return 1;
  }

  const leftTokens = tokenSet(left);
  const rightTokens = tokenSet(right);

  if (leftTokens.size === 0 || rightTokens.size === 0) {
    return 0;
  }

  let intersection = 0;

  for (const token of leftTokens) {
    if (rightTokens.has(token)) {
      intersection += 1;
    }
  }

  const union = new Set([...leftTokens, ...rightTokens]).size;

  return union === 0 ? 0 : intersection / union;
}


function inferPriority(
  kind: LegalReviewDeviationKind,
  baselineExcerpt: string | null,
  counterpartyExcerpt: string | null,
): LegalReviewDeviationPriority {
  const combined = `${baselineExcerpt ?? ""} ${counterpartyExcerpt ?? ""}`.toLowerCase();

  if (
    /liabilit|indemn|warrant|termination|governing law|confidential|intellectual property|payment|fee|penalt/.test(
      combined,
    )
  ) {
    return kind === "removed" ? "critical" : "high";
  }

  if (kind === "added" || kind === "removed") {
    return "medium";
  }

  const left = baselineExcerpt ?? "";
  const right = counterpartyExcerpt ?? "";
  const changeRatio = 1 - similarity(left, right);

  if (changeRatio >= 0.45) {
    return "high";
  }

  if (changeRatio >= 0.2) {
    return "medium";
  }

  return "low";
}

function buildTitle(
  kind: LegalReviewDeviationKind,
  baselineExcerpt: string | null,
  counterpartyExcerpt: string | null,
): string {
  const source = counterpartyExcerpt ?? baselineExcerpt ?? "Agreement section";

  const snippet = source.split(/\s+/).slice(0, 8).join(" ");

  switch (kind) {
    case "added":
      return `New counterparty language: ${snippet}`;
    case "removed":
      return `Removed baseline language: ${snippet}`;
    case "modified":
      return `Modified language: ${snippet}`;
    case "clause_deviation":
      return `Clause deviation: ${snippet}`;
    default:
      return snippet;
  }
}

function createDeviation(
  kind: LegalReviewDeviationKind,
  baselineExcerpt: string | null,
  counterpartyExcerpt: string | null,
  createdAt: string,
  overrides?: Partial<LegalReviewDeviation>,
): LegalReviewDeviation {
  const priority =
    overrides?.priority ??
    inferPriority(kind, baselineExcerpt, counterpartyExcerpt);

  return {
    id: overrides?.id ?? `dev-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    kind,
    title: overrides?.title ?? buildTitle(kind, baselineExcerpt, counterpartyExcerpt),
    summary:
      overrides?.summary ??
      (kind === "added"
        ? "Counterparty added new language that was not present in the prior version."
        : kind === "removed"
          ? "Language from the prior version is missing in the counterparty redline."
          : "Counterparty edited existing language from the prior version."),
    priority,
    status: overrides?.status ?? "open",
    baselineExcerpt: baselineExcerpt ?? null,
    counterpartyExcerpt: counterpartyExcerpt ?? null,
    clauseId: overrides?.clauseId ?? null,
    clauseTitle: overrides?.clauseTitle ?? null,
    approvedClauseText: overrides?.approvedClauseText ?? null,
    createdAt,
  };
}

export function buildDocumentAlignment(
  input: DocumentComparisonInput,
): RedlineAlignmentBlock[] {
  const baselineBlocks = splitIntoBlocks(input.baselineText);
  const counterpartyBlocks = splitIntoBlocks(input.counterpartyText);
  const alignment: RedlineAlignmentBlock[] = [];
  const usedCounterparty = new Set<number>();

  for (const baselineBlock of baselineBlocks) {
    let bestIndex = -1;
    let bestScore = 0;

    for (const counterpartyBlock of counterpartyBlocks) {
      if (usedCounterparty.has(counterpartyBlock.index)) {
        continue;
      }

      const score = similarity(
        baselineBlock.normalized,
        counterpartyBlock.normalized,
      );

      if (score > bestScore) {
        bestScore = score;
        bestIndex = counterpartyBlock.index;
      }
    }

    if (bestIndex === -1 || bestScore < 0.55) {
      alignment.push({ kind: "removed", text: baselineBlock.text });
      continue;
    }

    usedCounterparty.add(bestIndex);
    const counterpartyBlock = counterpartyBlocks[bestIndex]!;

    if (blocksAreEquivalent(baselineBlock.text, counterpartyBlock.text)) {
      alignment.push({ kind: "unchanged", text: baselineBlock.text });
      continue;
    }

    alignment.push({
      kind: "modified",
      baselineText: baselineBlock.text,
      counterpartyText: counterpartyBlock.text,
    });
  }

  for (const counterpartyBlock of counterpartyBlocks) {
    if (usedCounterparty.has(counterpartyBlock.index)) {
      continue;
    }

    alignment.push({ kind: "added", text: counterpartyBlock.text });
  }

  return alignment;
}

export function compareDocumentTexts(
  input: DocumentComparisonInput,
): DocumentComparisonResult {
  const baselineBlocks = splitIntoBlocks(input.baselineText);
  const counterpartyBlocks = splitIntoBlocks(input.counterpartyText);
  const createdAt = new Date().toISOString();
  const deviations: LegalReviewDeviation[] = [];
  const usedCounterparty = new Set<number>();

  for (const baselineBlock of baselineBlocks) {
    let bestIndex = -1;
    let bestScore = 0;

    for (const counterpartyBlock of counterpartyBlocks) {
      if (usedCounterparty.has(counterpartyBlock.index)) {
        continue;
      }

      const score = similarity(
        baselineBlock.normalized,
        counterpartyBlock.normalized,
      );

      if (score > bestScore) {
        bestScore = score;
        bestIndex = counterpartyBlock.index;
      }
    }

    if (bestIndex === -1 || bestScore < 0.55) {
      deviations.push(
        createDeviation("removed", baselineBlock.text, null, createdAt),
      );
      continue;
    }

    usedCounterparty.add(bestIndex);
    const counterpartyBlock = counterpartyBlocks[bestIndex]!;

    if (blocksAreEquivalent(baselineBlock.text, counterpartyBlock.text)) {
      continue;
    }

    deviations.push(
      createDeviation(
        "modified",
        baselineBlock.text,
        counterpartyBlock.text,
        createdAt,
        {
          summary: summarizeMaterialChange(
            baselineBlock.text,
            counterpartyBlock.text,
            bestScore,
          ),
        },
      ),
    );
  }

  for (const counterpartyBlock of counterpartyBlocks) {
    if (usedCounterparty.has(counterpartyBlock.index)) {
      continue;
    }

    deviations.push(
      createDeviation("added", null, counterpartyBlock.text, createdAt),
    );
  }

  const priorityRank: Record<LegalReviewDeviationPriority, number> = {
    critical: 0,
    high: 1,
    medium: 2,
    low: 3,
  };

  deviations.sort(
    (left, right) => priorityRank[left.priority] - priorityRank[right.priority],
  );

  const summary =
    deviations.length === 0
      ? "No material text deviations were detected between the prior and counterparty versions."
      : `${deviations.length} deviation${deviations.length === 1 ? "" : "s"} detected. ${deviations.filter((item) => item.priority === "critical" || item.priority === "high").length} require priority legal review.`;

  return { deviations, summary };
}
