export interface WordDiffPart {
  kind: "equal" | "delete" | "insert";
  text: string;
}

function splitWords(text: string): string[] {
  return text.match(/\S+|\s+/g) ?? [text];
}

export function diffWords(
  baselineText: string,
  counterpartyText: string,
): WordDiffPart[] {
  const left = splitWords(baselineText);
  const right = splitWords(counterpartyText);
  const rows = left.length + 1;
  const cols = right.length + 1;
  const lengths = Array.from({ length: rows }, () => Array<number>(cols).fill(0));

  for (let row = rows - 2; row >= 0; row -= 1) {
    for (let col = cols - 2; col >= 0; col -= 1) {
      if (left[row] === right[col]) {
        lengths[row]![col] = lengths[row + 1]![col + 1]! + 1;
      } else {
        lengths[row]![col] = Math.max(
          lengths[row + 1]![col]!,
          lengths[row]![col + 1]!,
        );
      }
    }
  }

  const parts: WordDiffPart[] = [];
  let row = 0;
  let col = 0;

  while (row < left.length && col < right.length) {
    if (left[row] === right[col]) {
      parts.push({ kind: "equal", text: left[row]! });
      row += 1;
      col += 1;
      continue;
    }

    if (lengths[row + 1]?.[col]! >= lengths[row]?.[col + 1]!) {
      parts.push({ kind: "delete", text: left[row]! });
      row += 1;
    } else {
      parts.push({ kind: "insert", text: right[col]! });
      col += 1;
    }
  }

  while (row < left.length) {
    parts.push({ kind: "delete", text: left[row]! });
    row += 1;
  }

  while (col < right.length) {
    parts.push({ kind: "insert", text: right[col]! });
    col += 1;
  }

  return parts;
}

function stripExtractionNoise(text: string): string {
  return text
    .replace(/\bpage\s+\d+\s+of\s+\d+\b/gi, " ")
    .replace(/\b(?:page|pg\.?)\s*\d+\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeComparableText(text: string): string {
  return stripExtractionNoise(text).replace(/\s+/g, " ").trim().toLowerCase();
}

function significantTokens(text: string): string[] {
  return stripExtractionNoise(text)
    .toLowerCase()
    .match(/[a-z0-9]+(?:\.[a-z0-9]+)?/g)
    ?.filter((token) => token.length > 0) ?? [];
}

function numericTokens(text: string): string[] {
  return stripExtractionNoise(text).match(/\d+(?:\.\d+)?/g) ?? [];
}

function hasNumericChange(baselineText: string, counterpartyText: string): boolean {
  const leftNumbers = numericTokens(baselineText);
  const rightNumbers = numericTokens(counterpartyText);

  if (leftNumbers.length !== rightNumbers.length) {
    return true;
  }

  return leftNumbers.some((value, index) => value !== rightNumbers[index]);
}

function hasSignificantTokenChange(
  baselineText: string,
  counterpartyText: string,
): boolean {
  const leftTokens = new Set(significantTokens(baselineText));
  const rightTokens = new Set(significantTokens(counterpartyText));

  if (leftTokens.size !== rightTokens.size) {
    return true;
  }

  for (const token of leftTokens) {
    if (!rightTokens.has(token)) {
      return true;
    }
  }

  return false;
}

export function hasMaterialTextChange(
  baselineText: string,
  counterpartyText: string,
): boolean {
  if (
    normalizeComparableText(baselineText) === normalizeComparableText(counterpartyText)
  ) {
    return false;
  }

  if (hasNumericChange(baselineText, counterpartyText)) {
    return true;
  }

  const changedParts = diffWords(baselineText, counterpartyText).filter(
    (part) => part.kind !== "equal" && part.text.trim().length > 0,
  );

  if (changedParts.length === 0) {
    return hasSignificantTokenChange(baselineText, counterpartyText);
  }

  const changedText = changedParts.map((part) => part.text).join(" ").toLowerCase();

  if (
    /liabilit|indemn|terminat|payment|fee|cap|limit|notice|day|month|year|percent|%|times|\bx\b|\d/.test(
      changedText,
    )
  ) {
    return true;
  }

  const changedWordCount = changedParts.filter((part) => /\S/.test(part.text)).length;

  return changedWordCount >= 2;
}

export function blocksAreEquivalent(
  baselineText: string,
  counterpartyText: string,
): boolean {
  return !hasMaterialTextChange(baselineText, counterpartyText);
}

export function summarizeMaterialChange(
  baselineText: string,
  counterpartyText: string,
  similarityScore: number,
): string {
  if (hasNumericChange(baselineText, counterpartyText)) {
    return `Numeric or term value changed despite ${Math.round(similarityScore * 100)}% overall similarity.`;
  }

  return `Material wording change detected despite ${Math.round(similarityScore * 100)}% overall similarity.`;
}
