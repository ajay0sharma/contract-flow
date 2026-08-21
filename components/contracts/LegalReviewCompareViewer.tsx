"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  buildCompareSummaryLine,
  computeChangeStatistics,
  filterDeviationsForCompareView,
  COMPARE_KIND_LABELS,
  COMPARE_KIND_STYLES,
  type CompareStatusFilter,
  type CompareViewFilter,
} from "@/lib/legal-review-compare-view";
import { computeReviewStatistics } from "@/lib/legal-review-review-stats";
import { LegalReviewFullRedlineView } from "@/components/contracts/LegalReviewFullRedlineView";
import type {
  LegalReviewDeviation,
  LegalReviewDeviationStatus,
  LegalReviewRound,
} from "@/types/legal-review";
import {
  CompareChangeBadge,
  ComparePane,
  InlineRedlineText,
} from "@/components/contracts/LegalReviewCompareParts";

const PRIORITY_STYLES: Record<
  LegalReviewDeviation["priority"],
  string
> = {
  critical: "bg-rose-100 text-rose-800",
  high: "bg-orange-100 text-orange-800",
  medium: "bg-amber-100 text-amber-800",
  low: "bg-slate-100 text-slate-700",
};

const STATUS_STYLES: Record<LegalReviewDeviationStatus, string> = {
  open: "bg-slate-100 text-slate-700",
  accepted: "bg-emerald-100 text-emerald-800",
  rejected: "bg-rose-100 text-rose-800",
  resolved: "bg-blue-100 text-blue-800",
};

const FILTER_OPTIONS: Array<{ value: CompareViewFilter; label: string }> = [
  { value: "all", label: "All changes" },
  { value: "modified", label: "Modifications" },
  { value: "added", label: "Insertions" },
  { value: "removed", label: "Deletions" },
  { value: "moved", label: "Relocations" },
  { value: "formatting_change", label: "Formatting" },
  { value: "table_change", label: "Tables" },
  { value: "image_change", label: "Images" },
  { value: "footnote_change", label: "Footnotes" },
  { value: "clause_deviation", label: "Clause deviations" },
];

const STATUS_FILTER_OPTIONS: Array<{ value: CompareStatusFilter; label: string }> =
  [
    { value: "all", label: "All statuses" },
    { value: "pending", label: "Pending review" },
    { value: "reviewed", label: "Reviewed" },
    { value: "accepted", label: "Accepted" },
    { value: "rejected", label: "Rejected" },
    { value: "resolved", label: "Resolved" },
  ];

type CompareWorkspaceView = "change-review" | "full-redline";

interface LegalReviewCompareViewerProps {
  contractId: string;
  round: LegalReviewRound;
  onRoundUpdated: () => void;
  renderComments?: (deviation: LegalReviewDeviation) => React.ReactNode;
}

function SynchronizedComparePanes({
  original,
  modified,
}: {
  original: React.ReactNode;
  modified: React.ReactNode;
}) {
  const originalRef = useRef<HTMLDivElement | null>(null);
  const modifiedRef = useRef<HTMLDivElement | null>(null);
  const syncing = useRef(false);

  function syncScroll(source: HTMLDivElement, target: HTMLDivElement): void {
    if (syncing.current) {
      return;
    }

    syncing.current = true;
    const ratio =
      source.scrollTop / Math.max(source.scrollHeight - source.clientHeight, 1);
    target.scrollTop =
      ratio * Math.max(target.scrollHeight - target.clientHeight, 0);
    syncing.current = false;
  }

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <ComparePane label="Original">
        <div
          ref={originalRef}
          className="max-h-72 overflow-auto pr-1"
          onScroll={(event) => {
            if (modifiedRef.current) {
              syncScroll(event.currentTarget, modifiedRef.current);
            }
          }}
        >
          {original}
        </div>
      </ComparePane>
      <ComparePane label="Modified">
        <div
          ref={modifiedRef}
          className="max-h-72 overflow-auto pr-1"
          onScroll={(event) => {
            if (originalRef.current) {
              syncScroll(event.currentTarget, originalRef.current);
            }
          }}
        >
          {modified}
        </div>
      </ComparePane>
    </div>
  );
}

export function LegalReviewCompareViewer({
  contractId,
  round,
  onRoundUpdated,
  renderComments,
}: LegalReviewCompareViewerProps) {
  const [filter, setFilter] = useState<CompareViewFilter>("all");
  const [statusFilter, setStatusFilter] = useState<CompareStatusFilter>("all");
  const [hideLowPriority, setHideLowPriority] = useState(false);
  const [workspaceView, setWorkspaceView] =
    useState<CompareWorkspaceView>("change-review");
  const [activeIndex, setActiveIndex] = useState(0);
  const [updating, setUpdating] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const detailRef = useRef<HTMLDivElement | null>(null);

  const stats = useMemo(
    () => computeChangeStatistics(round.deviations),
    [round.deviations],
  );
  const reviewStats = useMemo(
    () => computeReviewStatistics(round.deviations),
    [round.deviations],
  );

  const filteredDeviations = useMemo(
    () =>
      filterDeviationsForCompareView(round.deviations, filter, {
        status: statusFilter,
        hideLowPriority,
      }),
    [round.deviations, filter, statusFilter, hideLowPriority],
  );

  const activeDeviation = filteredDeviations[activeIndex] ?? null;

  useEffect(() => {
    setActiveIndex(0);
  }, [filter, statusFilter, hideLowPriority, round.id]);

  useEffect(() => {
    if (activeDeviation && detailRef.current) {
      detailRef.current.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [activeDeviation?.id]);

  const stepChange = useCallback(
    (direction: -1 | 1): void => {
      if (filteredDeviations.length === 0) {
        return;
      }

      setActiveIndex(
        (current) =>
          (current + direction + filteredDeviations.length) %
          filteredDeviations.length,
      );
    },
    [filteredDeviations.length],
  );

  const updateDeviationStatus = useCallback(
    async (deviationId: string, status: LegalReviewDeviationStatus): Promise<void> => {
      setUpdating(true);
      setActionError(null);

      try {
        const response = await fetch(
          `/api/contracts/${contractId}/legal-review/${round.id}/deviations/${deviationId}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status }),
          },
        );
        const payload = (await response.json().catch(() => null)) as
          | { error?: string }
          | null;

        if (!response.ok) {
          throw new Error(payload?.error ?? "Unable to update change status.");
        }

        onRoundUpdated();
      } catch (error) {
        setActionError(
          error instanceof Error ? error.message : "Unable to update change status.",
        );
      } finally {
        setUpdating(false);
      }
    },
    [contractId, onRoundUpdated, round.id],
  );

  const bulkUpdateStatus = useCallback(
    async (
      status: LegalReviewDeviationStatus,
      deviationIds?: string[],
    ): Promise<void> => {
      setUpdating(true);
      setActionError(null);

      try {
        const response = await fetch(
          `/api/contracts/${contractId}/legal-review/${round.id}/deviations/bulk`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status, deviationIds }),
          },
        );
        const payload = (await response.json().catch(() => null)) as
          | { error?: string }
          | null;

        if (!response.ok) {
          throw new Error(payload?.error ?? "Unable to bulk update changes.");
        }

        onRoundUpdated();
      } catch (error) {
        setActionError(
          error instanceof Error ? error.message : "Unable to bulk update changes.",
        );
      } finally {
        setUpdating(false);
      }
    },
    [contractId, onRoundUpdated, round.id],
  );

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent): void {
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "TEXTAREA" ||
          target.tagName === "INPUT" ||
          target.isContentEditable)
      ) {
        return;
      }

      if (event.key === "ArrowDown" || event.key === "j") {
        event.preventDefault();
        stepChange(1);
      }

      if (event.key === "ArrowUp" || event.key === "k") {
        event.preventDefault();
        stepChange(-1);
      }

      if (!activeDeviation) {
        return;
      }

      if (event.key === "a") {
        event.preventDefault();
        void updateDeviationStatus(activeDeviation.id, "accepted");
      }

      if (event.key === "r") {
        event.preventDefault();
        void updateDeviationStatus(activeDeviation.id, "rejected");
      }

      if (event.key === "e") {
        event.preventDefault();
        void updateDeviationStatus(activeDeviation.id, "resolved");
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeDeviation, stepChange, updateDeviationStatus]);

  if (round.deviations.length === 0) {
    return null;
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border bg-surface-muted p-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-foreground">
              Compare results
            </p>
            <p className="mt-1 text-sm text-text-secondary">
              {buildCompareSummaryLine(stats)}
            </p>
            <p className="mt-2 text-xs text-text-muted">
              Review progress: {reviewStats.reviewed}/{reviewStats.total} changes
              reviewed ({reviewStats.percentComplete}%)
            </p>
          </div>
          <div className="flex flex-wrap gap-2 text-xs">
            {stats.modified > 0 ? (
              <span className={`rounded-full px-2 py-1 font-medium ${COMPARE_KIND_STYLES.modified}`}>
                {stats.modified} modified
              </span>
            ) : null}
            {stats.added > 0 ? (
              <span className={`rounded-full px-2 py-1 font-medium ${COMPARE_KIND_STYLES.added}`}>
                {stats.added} inserted
              </span>
            ) : null}
            {stats.removed > 0 ? (
              <span className={`rounded-full px-2 py-1 font-medium ${COMPARE_KIND_STYLES.removed}`}>
                {stats.removed} deleted
              </span>
            ) : null}
            {stats.moved > 0 ? (
              <span className={`rounded-full px-2 py-1 font-medium ${COMPARE_KIND_STYLES.moved}`}>
                {stats.moved} relocated
              </span>
            ) : null}
            {stats.formatting > 0 ? (
              <span className={`rounded-full px-2 py-1 font-medium ${COMPARE_KIND_STYLES.formatting_change}`}>
                {stats.formatting} formatting
              </span>
            ) : null}
            {stats.tables > 0 ? (
              <span className={`rounded-full px-2 py-1 font-medium ${COMPARE_KIND_STYLES.table_change}`}>
                {stats.tables} tables
              </span>
            ) : null}
            {stats.images > 0 ? (
              <span className={`rounded-full px-2 py-1 font-medium ${COMPARE_KIND_STYLES.image_change}`}>
                {stats.images} images
              </span>
            ) : null}
            {stats.footnotes > 0 ? (
              <span className={`rounded-full px-2 py-1 font-medium ${COMPARE_KIND_STYLES.footnote_change}`}>
                {stats.footnotes} footnotes
              </span>
            ) : null}
          </div>
        </div>

        <div className="mt-4 h-2 overflow-hidden rounded-full bg-surface">
          <div
            className="h-full rounded-full bg-accent transition-all"
            style={{ width: `${reviewStats.percentComplete}%` }}
          />
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setWorkspaceView("change-review")}
            className={`rounded-full px-3 py-1 text-xs font-medium ${
              workspaceView === "change-review"
                ? "bg-accent text-white"
                : "bg-surface text-text-secondary hover:bg-surface-muted"
            }`}
          >
            Change-by-change review
          </button>
          <button
            type="button"
            disabled={!round.documentAlignment?.length}
            onClick={() => setWorkspaceView("full-redline")}
            className={`rounded-full px-3 py-1 text-xs font-medium disabled:opacity-50 ${
              workspaceView === "full-redline"
                ? "bg-accent text-white"
                : "bg-surface text-text-secondary hover:bg-surface-muted"
            }`}
          >
            Full document redline
          </button>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {FILTER_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setFilter(option.value)}
              className={`rounded-full px-3 py-1 text-xs font-medium ${
                filter === option.value
                  ? "bg-accent text-white"
                  : "bg-surface text-text-secondary hover:bg-surface-muted"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          {STATUS_FILTER_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setStatusFilter(option.value)}
              className={`rounded-full px-3 py-1 text-xs font-medium ${
                statusFilter === option.value
                  ? "bg-slate-800 text-white"
                  : "bg-surface text-text-secondary hover:bg-surface-muted"
              }`}
            >
              {option.label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setHideLowPriority((current) => !current)}
            className={`rounded-full px-3 py-1 text-xs font-medium ${
              hideLowPriority
                ? "bg-slate-800 text-white"
                : "bg-surface text-text-secondary hover:bg-surface-muted"
            }`}
          >
            Hide low priority
          </button>
        </div>
      </div>

      {actionError ? <p className="text-sm text-rose-600">{actionError}</p> : null}

      {workspaceView === "full-redline" && round.documentAlignment?.length ? (
        <LegalReviewFullRedlineView alignment={round.documentAlignment} />
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border bg-surface px-4 py-3">
            <div>
              <p className="text-sm text-text-secondary">
                {filteredDeviations.length === 0
                  ? "No changes match the current filters."
                  : `Change ${activeIndex + 1} of ${filteredDeviations.length}`}
              </p>
              <p className="mt-1 text-xs text-text-muted">
                Shortcuts: ↑/↓ or j/k navigate · a accept · r reject · e resolve
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={filteredDeviations.length === 0 || updating}
                onClick={() => stepChange(-1)}
                className="rounded-md border border-border px-3 py-1.5 text-sm font-medium text-foreground hover:bg-surface-muted disabled:opacity-50"
              >
                Previous change
              </button>
              <button
                type="button"
                disabled={filteredDeviations.length === 0 || updating}
                onClick={() => stepChange(1)}
                className="rounded-md border border-border px-3 py-1.5 text-sm font-medium text-foreground hover:bg-surface-muted disabled:opacity-50"
              >
                Next change
              </button>
              <button
                type="button"
                disabled={updating || filteredDeviations.length === 0}
                onClick={() =>
                  void bulkUpdateStatus(
                    "accepted",
                    filteredDeviations.map((item) => item.id),
                  )
                }
                className="rounded-md border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-sm font-medium text-emerald-800 disabled:opacity-50"
              >
                Accept filtered
              </button>
              <button
                type="button"
                disabled={updating || filteredDeviations.length === 0}
                onClick={() =>
                  void bulkUpdateStatus(
                    "rejected",
                    filteredDeviations.map((item) => item.id),
                  )
                }
                className="rounded-md border border-rose-300 bg-rose-50 px-3 py-1.5 text-sm font-medium text-rose-800 disabled:opacity-50"
              >
                Reject filtered
              </button>
            </div>
          </div>

          <div className="grid gap-4 xl:grid-cols-[280px_minmax(0,1fr)]">
            <aside className="rounded-lg border border-border bg-surface">
              <div className="border-b border-border px-4 py-3">
                <p className="text-sm font-semibold text-foreground">Change list</p>
                <p className="mt-1 text-xs text-text-muted">
                  Numbered navigation across detected changes.
                </p>
              </div>
              <div className="max-h-[720px] overflow-auto p-2">
                {filteredDeviations.length === 0 ? (
                  <p className="px-2 py-3 text-sm text-text-muted">
                    Adjust filters to view other changes.
                  </p>
                ) : (
                  filteredDeviations.map((deviation, index) => (
                    <button
                      key={deviation.id}
                      type="button"
                      onClick={() => setActiveIndex(index)}
                      className={`mb-2 w-full rounded-md border px-3 py-3 text-left transition ${
                        index === activeIndex
                          ? "border-accent bg-accent/5"
                          : "border-border bg-surface hover:bg-surface-muted"
                      }`}
                    >
                      <CompareChangeBadge deviation={deviation} index={index} />
                      <p className="mt-2 line-clamp-2 text-sm font-medium text-foreground">
                        {deviation.title}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <span
                          className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${PRIORITY_STYLES[deviation.priority]}`}
                        >
                          {deviation.priority}
                        </span>
                        <span
                          className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS_STYLES[deviation.status]}`}
                        >
                          {deviation.status}
                        </span>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </aside>

            <div ref={detailRef} className="space-y-4">
              {activeDeviation ? (
                <>
                  <div className="rounded-lg border border-border bg-surface p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <CompareChangeBadge
                        deviation={activeDeviation}
                        index={activeIndex}
                      />
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${PRIORITY_STYLES[activeDeviation.priority]}`}
                      >
                        {activeDeviation.priority}
                      </span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[activeDeviation.status]}`}
                      >
                        {activeDeviation.status}
                      </span>
                    </div>
                    <h3 className="mt-3 text-base font-semibold text-foreground">
                      {activeDeviation.title}
                    </h3>
                    <p className="mt-2 text-sm text-text-secondary">
                      {activeDeviation.summary}
                    </p>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={updating}
                        onClick={() =>
                          void updateDeviationStatus(activeDeviation.id, "accepted")
                        }
                        className="rounded-md border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-sm font-medium text-emerald-800 disabled:opacity-50"
                      >
                        Accept change
                      </button>
                      <button
                        type="button"
                        disabled={updating}
                        onClick={() =>
                          void updateDeviationStatus(activeDeviation.id, "rejected")
                        }
                        className="rounded-md border border-rose-300 bg-rose-50 px-3 py-1.5 text-sm font-medium text-rose-800 disabled:opacity-50"
                      >
                        Reject change
                      </button>
                      <button
                        type="button"
                        disabled={updating}
                        onClick={() =>
                          void updateDeviationStatus(activeDeviation.id, "resolved")
                        }
                        className="rounded-md border border-border px-3 py-1.5 text-sm font-medium text-foreground disabled:opacity-50"
                      >
                        Mark resolved
                      </button>
                    </div>
                  </div>

                  <SynchronizedComparePanes
                    original={
                      <p className="whitespace-pre-wrap text-sm text-text-secondary">
                        {activeDeviation.baselineExcerpt ??
                          (activeDeviation.kind === "added"
                            ? "No corresponding language in the prior version."
                            : "No baseline excerpt available.")}
                      </p>
                    }
                    modified={
                      <p className="whitespace-pre-wrap text-sm text-text-secondary">
                        {activeDeviation.counterpartyExcerpt ??
                          (activeDeviation.kind === "removed"
                            ? "Language removed in the counterparty version."
                            : "No counterparty excerpt available.")}
                      </p>
                    }
                  />

                  <ComparePane label="Redline · combined view" active>
                    {activeDeviation.kind === "moved" ? (
                      <div className="space-y-3 text-sm">
                        <p className="text-indigo-800">
                          <span className="font-medium">Relocated section.</span>{" "}
                          Compare the prior position against the new position below.
                        </p>
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">
                            Prior position
                          </p>
                          <InlineRedlineText baseline={activeDeviation.baselineExcerpt} />
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
                  </ComparePane>

                  {activeDeviation.approvedClauseText ? (
                    <div className="rounded-md border border-violet-200 bg-violet-50 p-4">
                      <p className="text-xs font-semibold uppercase tracking-wide text-violet-700">
                        Approved clause text
                      </p>
                      <p className="mt-2 whitespace-pre-wrap text-sm text-violet-900">
                        {activeDeviation.approvedClauseText}
                      </p>
                    </div>
                  ) : null}

                  {renderComments ? renderComments(activeDeviation) : null}
                </>
              ) : (
                <p className="rounded-lg border border-border bg-surface p-6 text-sm text-text-muted">
                  Select a change from the list to review the original, modified, and
                  combined redline panes.
                </p>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
