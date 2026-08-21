"use client";

import { COMPARE_KIND_LABELS } from "@/lib/legal-review-compare-view";
import type { LegalReviewAlignmentBlock } from "@/types/legal-review";
import { InlineRedlineText } from "@/components/contracts/LegalReviewCompareParts";

function renderFullRedlineBlock(block: LegalReviewAlignmentBlock, index: number) {
  switch (block.kind) {
    case "unchanged":
      return (
        <p key={`unchanged-${index}`} className="whitespace-pre-wrap text-sm text-text-secondary">
          {block.text}
        </p>
      );
    case "removed":
      return (
        <div
          key={`removed-${index}`}
          className="rounded-md border border-rose-200 bg-rose-50 p-3"
        >
          <p className="text-xs font-semibold uppercase tracking-wide text-rose-700">
            {COMPARE_KIND_LABELS.removed}
            {block.movedTo ? " · relocated from here" : ""}
          </p>
          <InlineRedlineText baseline={block.text} />
        </div>
      );
    case "added":
      return (
        <div
          key={`added-${index}`}
          className="rounded-md border border-emerald-200 bg-emerald-50 p-3"
        >
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
            {COMPARE_KIND_LABELS.added}
            {block.movedFrom ? " · relocated to here" : ""}
          </p>
          <InlineRedlineText counterparty={block.text} />
        </div>
      );
    case "modified":
      return (
        <div
          key={`modified-${index}`}
          className="rounded-md border border-sky-200 bg-sky-50 p-3"
        >
          <p className="text-xs font-semibold uppercase tracking-wide text-sky-700">
            {COMPARE_KIND_LABELS.modified}
          </p>
          <InlineRedlineText
            baseline={block.baselineText}
            counterparty={block.counterpartyText}
          />
        </div>
      );
    case "moved":
      return (
        <div
          key={`moved-${index}`}
          className="rounded-md border border-indigo-200 bg-indigo-50 p-3"
        >
          <p className="text-xs font-semibold uppercase tracking-wide text-indigo-700">
            {COMPARE_KIND_LABELS.moved}
          </p>
          <div className="mt-2 space-y-2">
            <div>
              <p className="text-xs text-text-muted">Prior position</p>
              <InlineRedlineText baseline={block.baselineText} />
            </div>
            <div>
              <p className="text-xs text-text-muted">New position</p>
              <InlineRedlineText counterparty={block.counterpartyText} />
            </div>
          </div>
        </div>
      );
    default:
      return null;
  }
}

export function LegalReviewFullRedlineView({
  alignment,
}: {
  alignment: LegalReviewAlignmentBlock[];
}) {
  return (
    <div className="rounded-lg border border-border bg-surface">
      <div className="border-b border-border px-4 py-3">
        <p className="text-sm font-semibold text-foreground">Full document redline</p>
        <p className="mt-1 text-xs text-text-muted">
          Scroll the combined redline document with all insertions, deletions, modifications,
          and relocations marked inline.
        </p>
      </div>
      <div className="max-h-[720px] space-y-4 overflow-auto p-4">
        {alignment.map((block, index) => renderFullRedlineBlock(block, index))}
      </div>
    </div>
  );
}
