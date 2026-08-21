import type {
  LegalReviewAlignmentBlock,
  LegalReviewDeviation,
} from "@/types/legal-review";

export function findDeviationForAlignmentBlock(
  block: LegalReviewAlignmentBlock,
  deviations: LegalReviewDeviation[],
): LegalReviewDeviation | undefined {
  return deviations.find((deviation) => {
    switch (block.kind) {
      case "modified":
        return (
          (deviation.kind === "modified" ||
            deviation.kind === "formatting_change" ||
            deviation.kind === "table_change" ||
            deviation.kind === "image_change" ||
            deviation.kind === "footnote_change") &&
          deviation.baselineExcerpt === block.baselineText &&
          deviation.counterpartyExcerpt === block.counterpartyText
        );
      case "added":
        return (
          (deviation.kind === "added" ||
            deviation.kind === "image_change" ||
            deviation.kind === "table_change" ||
            deviation.kind === "footnote_change") &&
          deviation.counterpartyExcerpt === block.text
        );
      case "removed":
        return (
          (deviation.kind === "removed" ||
            deviation.kind === "image_change" ||
            deviation.kind === "table_change" ||
            deviation.kind === "footnote_change") &&
          deviation.baselineExcerpt === block.text
        );
      case "moved":
        return (
          deviation.kind === "moved" &&
          deviation.baselineExcerpt === block.baselineText &&
          deviation.counterpartyExcerpt === block.counterpartyText
        );
      default:
        return false;
    }
  });
}

export function findDeviationById(
  deviations: LegalReviewDeviation[],
  deviationId: string,
): LegalReviewDeviation | undefined {
  return deviations.find((deviation) => deviation.id === deviationId);
}
