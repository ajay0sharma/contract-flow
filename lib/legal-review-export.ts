import {
  buildCleanReviewFileName,
  generateCleanReviewDocx,
} from "@/lib/legal-review-clean-docx";
import {
  buildChangeLogFileName,
  generateChangeLogCsv,
} from "@/lib/legal-review-change-log";
import {
  buildRedlineHtmlFileName,
  generateRedlineHtml,
} from "@/lib/legal-review-redline-html";
import {
  buildRedlinePdfFileName,
  generateRedlinePdf,
} from "@/lib/legal-review-redline-pdf";
import type { LegalReviewRound } from "@/types/legal-review";

export type LegalReviewExportFormat = "docx" | "pdf" | "html" | "csv" | "clean-docx";

export function ensureRoundHasAlignment(round: LegalReviewRound): void {
  if (!round.documentAlignment || round.documentAlignment.length === 0) {
    throw new Error(
      "Document alignment is unavailable for this round. Re-run the comparison to regenerate export data.",
    );
  }
}

export async function generateLegalReviewExport(
  round: LegalReviewRound,
  format: LegalReviewExportFormat,
): Promise<{ buffer: Buffer; fileName: string; mimeType: string }> {
  switch (format) {
    case "csv": {
      const csv = generateChangeLogCsv(round);
      return {
        buffer: Buffer.from(csv, "utf8"),
        fileName: buildChangeLogFileName(round.roundNumber),
        mimeType: "text/csv;charset=utf-8",
      };
    }
    case "clean-docx": {
      ensureRoundHasAlignment(round);
      const buffer = await generateCleanReviewDocx({
        roundNumber: round.roundNumber,
        baselineFileName: round.baselineFileName,
        counterpartyFileName: round.counterpartyFileName,
        alignment: round.documentAlignment!,
        deviations: round.deviations,
      });
      return {
        buffer,
        fileName: buildCleanReviewFileName(round.roundNumber),
        mimeType:
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      };
    }
    case "html": {
      ensureRoundHasAlignment(round);
      const html = generateRedlineHtml({
        roundNumber: round.roundNumber,
        baselineFileName: round.baselineFileName,
        counterpartyFileName: round.counterpartyFileName,
        comparisonSummary: round.comparisonSummary ?? "",
        alignment: round.documentAlignment!,
      });
      return {
        buffer: Buffer.from(html, "utf8"),
        fileName: buildRedlineHtmlFileName(round.roundNumber),
        mimeType: "text/html;charset=utf-8",
      };
    }
    case "pdf": {
      ensureRoundHasAlignment(round);
      const buffer = await generateRedlinePdf({
        roundNumber: round.roundNumber,
        baselineFileName: round.baselineFileName,
        counterpartyFileName: round.counterpartyFileName,
        comparisonSummary: round.comparisonSummary ?? "",
        alignment: round.documentAlignment!,
      });
      return {
        buffer,
        fileName: buildRedlinePdfFileName(round.roundNumber),
        mimeType: "application/pdf",
      };
    }
    default:
      throw new Error("Unsupported export format.");
  }
}
