import { COMPARE_KIND_LABELS } from "@/lib/legal-review-compare-view";
import type { LegalReviewDeviation, LegalReviewRound } from "@/types/legal-review";

function csvEscape(value: string): string {
  if (/[",\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }

  return value;
}

export function generateChangeLogCsv(round: LegalReviewRound): string {
  const header = [
    "Change Number",
    "Kind",
    "Priority",
    "Status",
    "Title",
    "Summary",
    "Prior Version Excerpt",
    "Counterparty Excerpt",
    "Clause Title",
  ];

  const rows = round.deviations.map((deviation, index) =>
    formatChangeLogRow(deviation, index + 1),
  );

  return [header, ...rows].map((row) => row.map(csvEscape).join(",")).join("\n");
}

function formatChangeLogRow(
  deviation: LegalReviewDeviation,
  changeNumber: number,
): string[] {
  return [
    String(changeNumber),
    COMPARE_KIND_LABELS[deviation.kind],
    deviation.priority,
    deviation.status,
    deviation.title,
    deviation.summary,
    deviation.baselineExcerpt ?? "",
    deviation.counterpartyExcerpt ?? "",
    deviation.clauseTitle ?? "",
  ];
}

export function buildChangeLogFileName(roundNumber: number): string {
  return `legal-review-round-${roundNumber}-change-log.csv`;
}
