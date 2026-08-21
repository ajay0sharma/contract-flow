import { diffWords } from "@/lib/legal-review-text-diff";
import { COMPARE_KIND_LABELS } from "@/lib/legal-review-compare-view";
import type { LegalReviewAlignmentBlock } from "@/types/legal-review";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function inlineRedlineHtml(baseline: string, counterparty: string): string {
  return diffWords(baseline, counterparty)
    .map((part) => {
      if (part.kind === "equal") {
        return escapeHtml(part.text);
      }

      if (part.kind === "delete") {
        return `<del>${escapeHtml(part.text)}</del>`;
      }

      return `<ins>${escapeHtml(part.text)}</ins>`;
    })
    .join("");
}

function renderAlignmentBlock(block: LegalReviewAlignmentBlock): string {
  switch (block.kind) {
    case "unchanged":
      return `<p>${escapeHtml(block.text)}</p>`;
    case "removed":
      return `<p class="removed">${block.movedTo ? "<em>[Relocated section removed]</em> " : ""}<del>${escapeHtml(block.text)}</del></p>`;
    case "added":
      return `<p class="added">${block.movedFrom ? "<em>[Relocated section inserted]</em> " : ""}<ins>${escapeHtml(block.text)}</ins></p>`;
    case "modified":
      return `<p class="modified">${inlineRedlineHtml(block.baselineText, block.counterpartyText)}</p>`;
    case "moved":
      return `<div class="moved"><p><strong>${COMPARE_KIND_LABELS.moved}</strong></p><p><del>${escapeHtml(block.baselineText)}</del></p><p><ins>${escapeHtml(block.counterpartyText)}</ins></p></div>`;
    default:
      return "";
  }
}

export function generateRedlineHtml(input: {
  roundNumber: number;
  baselineFileName: string;
  counterpartyFileName: string;
  comparisonSummary: string;
  alignment: LegalReviewAlignmentBlock[];
}): string {
  const body = input.alignment.map(renderAlignmentBlock).join("\n");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Legal Review Redline — Round ${input.roundNumber}</title>
  <style>
    body { font-family: Georgia, "Times New Roman", serif; line-height: 1.5; color: #111; margin: 40px; }
    h1, h2 { font-family: Arial, sans-serif; }
    .meta { color: #555; font-size: 14px; margin-bottom: 24px; }
    del { color: #b42318; text-decoration: line-through; background: #fef3f2; }
    ins { color: #027a48; text-decoration: underline; background: #ecfdf3; }
    .removed del, .added ins, .modified { padding: 2px 0; }
    .moved { border-left: 3px solid #444ce7; padding-left: 12px; margin: 16px 0; }
    @media print { body { margin: 24px; } }
  </style>
</head>
<body>
  <h1>Legal Review Redline — Round ${input.roundNumber}</h1>
  <div class="meta">
    <p><strong>Prior version:</strong> ${escapeHtml(input.baselineFileName)}</p>
    <p><strong>Counterparty version:</strong> ${escapeHtml(input.counterpartyFileName)}</p>
    <p><strong>Summary:</strong> ${escapeHtml(input.comparisonSummary)}</p>
  </div>
  <h2>Redlined agreement text</h2>
  ${body}
</body>
</html>`;
}

export function buildRedlineHtmlFileName(roundNumber: number): string {
  return `legal-review-round-${roundNumber}-redline.html`;
}
