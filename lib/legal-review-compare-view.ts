import type {
  LegalReviewChangeStatistics,
  LegalReviewDeviation,
  LegalReviewDeviationKind,
  LegalReviewDeviationPriority,
} from "@/types/legal-review";

export type CompareViewFilter =
  | "all"
  | "modified"
  | "added"
  | "removed"
  | "moved"
  | "formatting_change"
  | "table_change"
  | "image_change"
  | "footnote_change"
  | "clause_deviation";

export type CompareStatusFilter =
  | "all"
  | "pending"
  | "reviewed"
  | "accepted"
  | "rejected"
  | "resolved";

export const COMPARE_KIND_LABELS: Record<LegalReviewDeviationKind, string> = {
  modified: "Modification",
  added: "Insertion",
  removed: "Deletion",
  moved: "Relocation",
  formatting_change: "Formatting",
  table_change: "Table",
  image_change: "Image",
  footnote_change: "Footnote",
  clause_deviation: "Clause deviation",
};

export const COMPARE_KIND_STYLES: Record<LegalReviewDeviationKind, string> = {
  modified: "bg-sky-100 text-sky-800",
  added: "bg-emerald-100 text-emerald-800",
  removed: "bg-rose-100 text-rose-800",
  moved: "bg-indigo-100 text-indigo-800",
  formatting_change: "bg-fuchsia-100 text-fuchsia-800",
  table_change: "bg-cyan-100 text-cyan-800",
  image_change: "bg-amber-100 text-amber-900",
  footnote_change: "bg-teal-100 text-teal-800",
  clause_deviation: "bg-violet-100 text-violet-800",
};

export function computeChangeStatistics(
  deviations: LegalReviewDeviation[],
): LegalReviewChangeStatistics {
  const stats: LegalReviewChangeStatistics = {
    total: deviations.length,
    modified: 0,
    added: 0,
    removed: 0,
    moved: 0,
    formatting: 0,
    tables: 0,
    images: 0,
    footnotes: 0,
    clauseDeviations: 0,
    priority: {
      critical: 0,
      high: 0,
      medium: 0,
      low: 0,
    },
  };

  for (const deviation of deviations) {
    switch (deviation.kind) {
      case "modified":
        stats.modified += 1;
        break;
      case "added":
        stats.added += 1;
        break;
      case "removed":
        stats.removed += 1;
        break;
      case "moved":
        stats.moved += 1;
        break;
      case "formatting_change":
        stats.formatting += 1;
        break;
      case "table_change":
        stats.tables += 1;
        break;
      case "image_change":
        stats.images += 1;
        break;
      case "footnote_change":
        stats.footnotes += 1;
        break;
      case "clause_deviation":
        stats.clauseDeviations += 1;
        break;
      default:
        break;
    }

    stats.priority[deviation.priority] += 1;
  }

  return stats;
}

export function filterDeviationsForCompareView(
  deviations: LegalReviewDeviation[],
  filter: CompareViewFilter,
  options?: {
    priority?: LegalReviewDeviationPriority | "all";
    status?: CompareStatusFilter;
    hideLowPriority?: boolean;
  },
): LegalReviewDeviation[] {
  return deviations.filter((deviation) => {
    if (filter !== "all" && deviation.kind !== filter) {
      return false;
    }

    if (
      options?.priority &&
      options.priority !== "all" &&
      deviation.priority !== options.priority
    ) {
      return false;
    }

    if (options?.hideLowPriority && deviation.priority === "low") {
      return false;
    }

    if (options?.status && options.status !== "all") {
      if (options.status === "pending" && deviation.status !== "open") {
        return false;
      }

      if (options.status === "reviewed" && deviation.status === "open") {
        return false;
      }

      if (
        options.status !== "pending" &&
        options.status !== "reviewed" &&
        deviation.status !== options.status
      ) {
        return false;
      }
    }

    return true;
  });
}

export function buildLegalReviewComparisonSummary(
  deviations: LegalReviewDeviation[],
): string {
  if (deviations.length === 0) {
    return "No material changes were detected between the prior and counterparty versions.";
  }

  const stats = computeChangeStatistics(deviations);
  const detail = buildCompareSummaryLine(stats);
  const priorityCount = deviations.filter(
    (item) => item.priority === "critical" || item.priority === "high",
  ).length;

  const headline = `${deviations.length} deviation${deviations.length === 1 ? "" : "s"} detected`;

  if (priorityCount === 0) {
    return detail === "No material changes detected."
      ? headline
      : `${headline} (${detail}).`;
  }

  return `${headline} (${detail}). ${priorityCount} require priority legal review.`;
}

export function buildCompareSummaryLine(
  stats: LegalReviewChangeStatistics,
): string {
  const parts = [
    stats.modified > 0 ? `${stats.modified} modification${stats.modified === 1 ? "" : "s"}` : null,
    stats.added > 0 ? `${stats.added} insertion${stats.added === 1 ? "" : "s"}` : null,
    stats.removed > 0 ? `${stats.removed} deletion${stats.removed === 1 ? "" : "s"}` : null,
    stats.moved > 0 ? `${stats.moved} relocation${stats.moved === 1 ? "" : "s"}` : null,
    stats.formatting > 0
      ? `${stats.formatting} formatting change${stats.formatting === 1 ? "" : "s"}`
      : null,
    stats.tables > 0 ? `${stats.tables} table change${stats.tables === 1 ? "" : "s"}` : null,
    stats.images > 0 ? `${stats.images} image change${stats.images === 1 ? "" : "s"}` : null,
    stats.footnotes > 0
      ? `${stats.footnotes} footnote change${stats.footnotes === 1 ? "" : "s"}`
      : null,
    stats.clauseDeviations > 0
      ? `${stats.clauseDeviations} clause deviation${stats.clauseDeviations === 1 ? "" : "s"}`
      : null,
  ].filter(Boolean);

  if (parts.length === 0) {
    return "No material changes detected.";
  }

  return parts.join(" · ");
}
