import type {
  LegalReviewDeviation,
  LegalReviewReviewStatistics,
} from "@/types/legal-review";

export function computeReviewStatistics(
  deviations: LegalReviewDeviation[],
): LegalReviewReviewStatistics {
  const stats: LegalReviewReviewStatistics = {
    open: 0,
    accepted: 0,
    rejected: 0,
    resolved: 0,
    reviewed: 0,
    total: deviations.length,
    percentComplete: 0,
  };

  for (const deviation of deviations) {
    switch (deviation.status) {
      case "open":
        stats.open += 1;
        break;
      case "accepted":
        stats.accepted += 1;
        stats.reviewed += 1;
        break;
      case "rejected":
        stats.rejected += 1;
        stats.reviewed += 1;
        break;
      case "resolved":
        stats.resolved += 1;
        stats.reviewed += 1;
        break;
      default:
        break;
    }
  }

  stats.percentComplete =
    stats.total === 0 ? 100 : Math.round((stats.reviewed / stats.total) * 100);

  return stats;
}
