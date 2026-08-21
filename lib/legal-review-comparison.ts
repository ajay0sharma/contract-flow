import {
  blocksAreEquivalent,
  summarizeMaterialChange,
} from "@/lib/legal-review-text-diff";
import type {
  LegalReviewDeviation,
  LegalReviewDeviationKind,
  LegalReviewDeviationPriority,
  LegalReviewAlignmentBlock,
} from "@/types/legal-review";

export interface DocumentComparisonInput {
  baselineText: string;
  counterpartyText: string;
}

export interface DocumentComparisonResult {
  deviations: LegalReviewDeviation[];
  summary: string;
}

export type RedlineAlignmentBlock = LegalReviewAlignmentBlock;

interface TextBlock {
  index: number;
  text: string;
  normalized: string;
}

function coalesceParagraphFragments(parts: string[]): string[] {
  const normalized = parts
    .map((entry) => entry.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  const merged: string[] = [];
  let buffer = "";

  for (const part of normalized) {
    if (buffer.length === 0) {
      buffer = part;
      continue;
    }

    if (buffer.length < 12 || part.length < 12) {
      buffer = `${buffer} ${part}`;
      continue;
    }

    merged.push(buffer);
    buffer = part;
  }

  if (buffer) {
    if (merged.length > 0 && buffer.length < 12) {
      merged[merged.length - 1] = `${merged[merged.length - 1]} ${buffer}`;
    } else {
      merged.push(buffer);
    }
  }

  return merged.filter((entry) => entry.length >= 12 || /\d{3,}/.test(entry));
}

function splitIntoBlocks(text: string): TextBlock[] {
  return coalesceParagraphFragments(text.split(/\n\s*\n/)).map((entry, index) => ({
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

  if (kind === "moved") {
    return "medium";
  }

  if (
    kind === "formatting_change" ||
    kind === "table_change" ||
    kind === "image_change" ||
    kind === "footnote_change"
  ) {
    return kind === "table_change" ? "high" : "medium";
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
    case "moved":
      return `Relocated language: ${snippet}`;
    case "formatting_change":
      return `Formatting change: ${snippet}`;
    case "table_change":
      return `Table change: ${snippet}`;
    case "image_change":
      return `Image change: ${snippet}`;
    case "footnote_change":
      return `Footnote change: ${snippet}`;
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
          : kind === "moved"
            ? "This section appears to have been relocated rather than materially rewritten."
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

const MOVE_SIMILARITY_THRESHOLD = 0.85;

interface MovePair {
  removedIndex: number;
  addedIndex: number;
  score: number;
}

function findMovePairs(
  removedItems: Array<{ index: number; text: string }>,
  addedItems: Array<{ index: number; text: string }>,
): MovePair[] {
  const pairs: MovePair[] = [];
  const usedAdded = new Set<number>();

  for (const removed of removedItems) {
    let bestAddedIndex = -1;
    let bestScore = 0;

    for (const added of addedItems) {
      if (usedAdded.has(added.index)) {
        continue;
      }

      const score = similarity(removed.text.toLowerCase(), added.text.toLowerCase());

      if (score >= MOVE_SIMILARITY_THRESHOLD && score > bestScore) {
        bestScore = score;
        bestAddedIndex = added.index;
      }
    }

    if (bestAddedIndex !== -1) {
      usedAdded.add(bestAddedIndex);
      pairs.push({
        removedIndex: removed.index,
        addedIndex: bestAddedIndex,
        score: bestScore,
      });
    }
  }

  return pairs;
}

function annotateAlignmentMoves(alignment: RedlineAlignmentBlock[]): RedlineAlignmentBlock[] {
  const removedEntries: Array<{ index: number; text: string }> = [];
  const addedEntries: Array<{ index: number; text: string }> = [];

  alignment.forEach((block, index) => {
    if (block.kind === "removed") {
      removedEntries.push({ index, text: block.text });
    }

    if (block.kind === "added") {
      addedEntries.push({ index, text: block.text });
    }
  });

  const movePairs = findMovePairs(removedEntries, addedEntries);

  if (movePairs.length === 0) {
    return alignment;
  }

  const next = [...alignment];

  for (const pair of movePairs) {
    const removedBlock = next[pair.removedIndex];
    const addedBlock = next[pair.addedIndex];

    if (removedBlock?.kind !== "removed" || addedBlock?.kind !== "added") {
      continue;
    }

    next[pair.removedIndex] = {
      kind: "removed",
      text: removedBlock.text,
      movedTo: addedBlock.text,
    };
    next[pair.addedIndex] = {
      kind: "added",
      text: addedBlock.text,
      movedFrom: removedBlock.text,
    };
  }

  return next;
}

function collapseMovedDeviations(
  deviations: LegalReviewDeviation[],
  createdAt: string,
): LegalReviewDeviation[] {
  const removed = deviations.filter((item) => item.kind === "removed");
  const added = deviations.filter((item) => item.kind === "added");
  const others = deviations.filter(
    (item) => item.kind !== "removed" && item.kind !== "added",
  );

  const removedEntries = removed.map((item, index) => ({
    index,
    text: item.baselineExcerpt ?? "",
    deviation: item,
  }));
  const addedEntries = added.map((item, index) => ({
    index,
    text: item.counterpartyExcerpt ?? "",
    deviation: item,
  }));

  const movePairs = findMovePairs(
    removedEntries.map((item) => ({ index: item.index, text: item.text })),
    addedEntries.map((item) => ({ index: item.index, text: item.text })),
  );

  const usedRemoved = new Set<number>();
  const usedAdded = new Set<number>();
  const moved: LegalReviewDeviation[] = [];

  for (const pair of movePairs) {
    const removedDeviation = removedEntries[pair.removedIndex]?.deviation;
    const addedDeviation = addedEntries[pair.addedIndex]?.deviation;

    if (!removedDeviation || !addedDeviation) {
      continue;
    }

    usedRemoved.add(pair.removedIndex);
    usedAdded.add(pair.addedIndex);

    moved.push(
      createDeviation(
        "moved",
        removedDeviation.baselineExcerpt,
        addedDeviation.counterpartyExcerpt,
        createdAt,
        {
          summary: `Section relocated with ${Math.round(pair.score * 100)}% textual similarity between prior and counterparty versions.`,
          priority: removedDeviation.priority,
        },
      ),
    );
  }

  const remainingRemoved = removedEntries
    .filter((item) => !usedRemoved.has(item.index))
    .map((item) => item.deviation);
  const remainingAdded = addedEntries
    .filter((item) => !usedAdded.has(item.index))
    .map((item) => item.deviation);

  return [...others, ...moved, ...remainingRemoved, ...remainingAdded];
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
      if (baselineBlock.index !== counterpartyBlock.index) {
        alignment.push({
          kind: "moved",
          baselineText: baselineBlock.text,
          counterpartyText: counterpartyBlock.text,
        });
      } else {
        alignment.push({ kind: "unchanged", text: baselineBlock.text });
      }
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

  return annotateAlignmentMoves(alignment);
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
      if (baselineBlock.index !== counterpartyBlock.index) {
        deviations.push(
          createDeviation(
            "moved",
            baselineBlock.text,
            counterpartyBlock.text,
            createdAt,
            {
              summary: `Section relocated from block ${baselineBlock.index + 1} to block ${counterpartyBlock.index + 1} with equivalent language.`,
            },
          ),
        );
      }
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

  const collapsedDeviations = collapseMovedDeviations(deviations, createdAt);

  collapsedDeviations.sort(
    (left, right) => priorityRank[left.priority] - priorityRank[right.priority],
  );

  const summary =
    collapsedDeviations.length === 0
      ? "No material text deviations were detected between the prior and counterparty versions."
      : `${collapsedDeviations.length} deviation${collapsedDeviations.length === 1 ? "" : "s"} detected. ${collapsedDeviations.filter((item) => item.priority === "critical" || item.priority === "high").length} require priority legal review.`;

  return { deviations: collapsedDeviations, summary };
}
