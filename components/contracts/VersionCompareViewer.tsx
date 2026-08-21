"use client";

import { useEffect, useMemo, useState } from "react";
import { computeChangeStatistics } from "@/lib/legal-review-compare-view";
import type {
  LegalReviewDeviation,
  LegalReviewDeviationKind,
  LegalReviewRound,
} from "@/types/legal-review";
import { InlineRedlineText } from "@/components/contracts/LegalReviewCompareParts";

type ChangeFilter = "all" | "important";

const SIMPLE_KIND_LABELS: Record<LegalReviewDeviationKind, string> = {
  modified: "Modified",
  added: "Added",
  removed: "Removed",
  moved: "Moved",
  formatting_change: "Formatting",
  table_change: "Table",
  image_change: "Image",
  footnote_change: "Footnote",
  clause_deviation: "Clause note",
};

const SIMPLE_KIND_STYLES: Record<LegalReviewDeviationKind, string> = {
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

function SimpleChangeBadge({
  deviation,
  index,
}: {
  deviation: LegalReviewDeviation;
  index: number;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-surface-muted text-xs font-semibold text-foreground">
        {index + 1}
      </span>
      <span
        className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${SIMPLE_KIND_STYLES[deviation.kind]}`}
      >
        {SIMPLE_KIND_LABELS[deviation.kind]}
      </span>
    </div>
  );
}

function isImportantChange(deviation: LegalReviewDeviation): boolean {
  return deviation.priority === "critical" || deviation.priority === "high";
}

function filterDeviations(
  deviations: LegalReviewDeviation[],
  filter: ChangeFilter,
): LegalReviewDeviation[] {
  if (filter === "all") {
    return deviations;
  }

  return deviations.filter(isImportantChange);
}

interface VersionCompareViewerProps {
  round: LegalReviewRound;
}

export function VersionCompareViewer({ round }: VersionCompareViewerProps) {
  const [filter, setFilter] = useState<ChangeFilter>("all");
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    setFilter("all");
    setActiveIndex(0);
  }, [round.id, round.comparedAt]);

  const stats = useMemo(
    () => computeChangeStatistics(round.deviations),
    [round.deviations],
  );

  const filteredDeviations = useMemo(
    () => filterDeviations(round.deviations, filter),
    [filter, round.deviations],
  );

  const safeActiveIndex =
    filteredDeviations.length === 0
      ? 0
      : Math.min(activeIndex, filteredDeviations.length - 1);
  const activeDeviation = filteredDeviations[safeActiveIndex] ?? null;

  function stepChange(direction: -1 | 1): void {
    if (filteredDeviations.length === 0) {
      return;
    }

    setActiveIndex(
      (current) =>
        (current + direction + filteredDeviations.length) %
        filteredDeviations.length,
    );
  }

  if (round.deviations.length === 0) {
    return null;
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border bg-surface-muted p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm font-semibold text-foreground">
            {stats.total} change{stats.total === 1 ? "" : "s"} found
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                setFilter("all");
                setActiveIndex(0);
              }}
              className={`rounded-full px-3 py-1 text-xs font-medium ${
                filter === "all"
                  ? "bg-accent text-white"
                  : "bg-surface text-text-secondary hover:bg-surface-muted"
              }`}
            >
              All changes
            </button>
            <button
              type="button"
              onClick={() => {
                setFilter("important");
                setActiveIndex(0);
              }}
              className={`rounded-full px-3 py-1 text-xs font-medium ${
                filter === "important"
                  ? "bg-accent text-white"
                  : "bg-surface text-text-secondary hover:bg-surface-muted"
              }`}
            >
              Important only
            </button>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-2 text-xs">
          {stats.modified > 0 ? (
            <span className="rounded-full bg-sky-100 px-2 py-1 font-medium text-sky-800">
              {stats.modified} modified
            </span>
          ) : null}
          {stats.added > 0 ? (
            <span className="rounded-full bg-emerald-100 px-2 py-1 font-medium text-emerald-800">
              {stats.added} added
            </span>
          ) : null}
          {stats.removed > 0 ? (
            <span className="rounded-full bg-rose-100 px-2 py-1 font-medium text-rose-800">
              {stats.removed} removed
            </span>
          ) : null}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border bg-surface px-4 py-3">
        <p className="text-sm text-text-secondary">
          {filteredDeviations.length === 0
            ? "No important changes match this filter."
            : `Change ${safeActiveIndex + 1} of ${filteredDeviations.length}`}
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={filteredDeviations.length === 0}
            onClick={() => stepChange(-1)}
            className="rounded-md border border-border px-3 py-1.5 text-sm font-medium text-foreground hover:bg-surface-muted disabled:opacity-50"
          >
            Previous
          </button>
          <button
            type="button"
            disabled={filteredDeviations.length === 0}
            onClick={() => stepChange(1)}
            className="rounded-md border border-border px-3 py-1.5 text-sm font-medium text-foreground hover:bg-surface-muted disabled:opacity-50"
          >
            Next
          </button>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[260px_minmax(0,1fr)]">
        <aside className="rounded-lg border border-border bg-surface">
          <div className="border-b border-border px-4 py-3">
            <p className="text-sm font-semibold text-foreground">Changes</p>
            <p className="mt-1 text-xs text-text-muted">
              Select a change to view the redline.
            </p>
          </div>
          <div className="max-h-[560px] overflow-auto p-2">
            {filteredDeviations.length === 0 ? (
              <p className="px-2 py-3 text-sm text-text-muted">
                Try showing all changes instead.
              </p>
            ) : (
              filteredDeviations.map((deviation, index) => (
                <button
                  key={deviation.id}
                  type="button"
                  onClick={() => setActiveIndex(index)}
                  className={`mb-2 w-full rounded-md border px-3 py-3 text-left transition ${
                    index === safeActiveIndex
                      ? "border-accent bg-accent/5"
                      : "border-border bg-surface hover:bg-surface-muted"
                  }`}
                >
                  <SimpleChangeBadge deviation={deviation} index={index} />
                  <p className="mt-2 line-clamp-2 text-sm font-medium text-foreground">
                    {deviation.title}
                  </p>
                  {isImportantChange(deviation) ? (
                    <span className="mt-2 inline-flex rounded-full bg-orange-100 px-2 py-0.5 text-[11px] font-medium text-orange-800">
                      Important
                    </span>
                  ) : null}
                </button>
              ))
            )}
          </div>
        </aside>

        <div className="space-y-4">
          {activeDeviation ? (
            <>
              <div className="rounded-lg border border-border bg-surface p-4">
                <SimpleChangeBadge
                  deviation={activeDeviation}
                  index={safeActiveIndex}
                />
                <h3 className="mt-3 text-base font-semibold text-foreground">
                  {activeDeviation.title}
                </h3>
                <p className="mt-2 text-sm text-text-secondary">
                  {activeDeviation.summary}
                </p>
              </div>

              <div className="rounded-lg border border-border bg-surface p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">
                  Redline
                </p>
                <div className="mt-3">
                  {activeDeviation.kind === "moved" ? (
                    <div className="space-y-3 text-sm">
                      <p className="text-indigo-800">
                        This section was relocated in the counterparty version.
                      </p>
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">
                          Prior position
                        </p>
                        <InlineRedlineText
                          baseline={activeDeviation.baselineExcerpt}
                        />
                      </div>
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">
                          New position
                        </p>
                        <InlineRedlineText
                          counterparty={activeDeviation.counterpartyExcerpt}
                        />
                      </div>
                    </div>
                  ) : (
                    <InlineRedlineText
                      baseline={activeDeviation.baselineExcerpt}
                      counterparty={activeDeviation.counterpartyExcerpt}
                    />
                  )}
                </div>
              </div>

              {activeDeviation.approvedClauseText ? (
                <div className="rounded-md border border-violet-200 bg-violet-50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-violet-700">
                    Suggested language
                  </p>
                  <p className="mt-2 whitespace-pre-wrap text-sm text-violet-900">
                    {activeDeviation.approvedClauseText}
                  </p>
                </div>
              ) : null}
            </>
          ) : (
            <p className="rounded-lg border border-border bg-surface p-6 text-sm text-text-muted">
              Select a change from the list to view the redline.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
