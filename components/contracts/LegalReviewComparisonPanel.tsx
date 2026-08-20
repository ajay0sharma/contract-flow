"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { formatContractDateTime } from "@/lib/format-dates";
import { findComparableAttachmentPairs } from "@/lib/legal-review-utils";
import type { ContractAttachment } from "@/types/contract";
import type {
  LegalReviewComment,
  LegalReviewDeviation,
  LegalReviewRound,
} from "@/types/legal-review";

interface LegalReviewComparisonPanelProps {
  contractId: string;
  attachments: ContractAttachment[];
}

const PRIORITY_STYLES: Record<
  LegalReviewDeviation["priority"],
  string
> = {
  critical: "bg-rose-100 text-rose-800",
  high: "bg-orange-100 text-orange-800",
  medium: "bg-amber-100 text-amber-800",
  low: "bg-slate-100 text-slate-700",
};

function isRedlineDownloadReady(round: LegalReviewRound): boolean {
  if (!round.comparedAt || !round.redlineDocument) {
    return false;
  }

  return !round.comparisonSummary?.includes(
    "Redline document could not be generated",
  );
}

function DeviationComments({
  contractId,
  roundId,
  deviationId,
  comments,
  onCommentAdded,
}: {
  contractId: string;
  roundId: string;
  deviationId: string;
  comments: LegalReviewComment[];
  onCommentAdded: () => void;
}) {
  const [body, setBody] = useState("");
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const threadedComments = useMemo(() => {
    const roots = comments.filter(
      (comment) => comment.deviationId === deviationId && !comment.parentCommentId,
    );

    return roots.map((root) => ({
      root,
      replies: comments.filter((comment) => comment.parentCommentId === root.id),
    }));
  }, [comments, deviationId]);

  async function handleSubmit(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/contracts/${contractId}/legal-review/${roundId}/comments`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            body,
            deviationId,
            parentCommentId: replyTo,
          }),
        },
      );
      const payload = (await response.json().catch(() => null)) as
        | { error?: string }
        | null;

      if (!response.ok) {
        throw new Error(payload?.error ?? "Unable to post comment.");
      }

      setBody("");
      setReplyTo(null);
      onCommentAdded();
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Unable to post comment.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mt-4 space-y-3 border-t border-border pt-4">
      {threadedComments.length === 0 ? (
        <p className="text-sm text-text-muted">No comments yet.</p>
      ) : (
        threadedComments.map(({ root, replies }) => (
          <div key={root.id} className="space-y-2">
            <div className="rounded-md bg-surface-muted px-3 py-2 text-sm">
              <p className="font-medium text-foreground">{root.authorName}</p>
              <p className="mt-1 text-text-secondary">{root.body}</p>
              <div className="mt-2 flex items-center gap-3 text-xs text-text-muted">
                <span>{formatContractDateTime(root.createdAt)}</span>
                <button
                  type="button"
                  className="font-medium text-accent hover:underline"
                  onClick={() => setReplyTo(root.id)}
                >
                  Reply
                </button>
              </div>
            </div>
            {replies.map((reply) => (
              <div
                key={reply.id}
                className="ml-4 rounded-md border border-border bg-surface px-3 py-2 text-sm"
              >
                <p className="font-medium text-foreground">{reply.authorName}</p>
                <p className="mt-1 text-text-secondary">{reply.body}</p>
                <p className="mt-2 text-xs text-text-muted">
                  {formatContractDateTime(reply.createdAt)}
                </p>
              </div>
            ))}
          </div>
        ))
      )}

      <form onSubmit={(event) => void handleSubmit(event)} className="space-y-2">
        {replyTo ? (
          <p className="text-xs text-text-muted">
            Replying to thread.{" "}
            <button
              type="button"
              className="font-medium text-accent hover:underline"
              onClick={() => setReplyTo(null)}
            >
              Cancel reply
            </button>
          </p>
        ) : null}
        <textarea
          value={body}
          onChange={(event) => setBody(event.target.value)}
          rows={3}
          placeholder="Add a legal review comment..."
          className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground"
        />
        {error ? <p className="text-sm text-rose-600">{error}</p> : null}
        <button
          type="submit"
          disabled={submitting || !body.trim()}
          className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
        >
          {submitting ? "Posting..." : "Post comment"}
        </button>
      </form>
    </div>
  );
}

function DeviationCard({
  contractId,
  round,
  deviation,
  comments,
  onUpdated,
}: {
  contractId: string;
  round: LegalReviewRound;
  deviation: LegalReviewDeviation;
  comments: LegalReviewComment[];
  onUpdated: () => void;
}) {
  return (
    <article className="rounded-lg border border-border bg-surface p-4 shadow-sm">
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-medium ${PRIORITY_STYLES[deviation.priority]}`}
          >
            {deviation.priority}
          </span>
          {deviation.kind === "clause_deviation" ? (
            <span className="rounded-full bg-violet-100 px-2 py-0.5 text-xs font-medium text-violet-800">
              Clause deviation
            </span>
          ) : null}
        </div>
        <h3 className="text-sm font-semibold text-foreground">{deviation.title}</h3>
        <p className="text-sm text-text-secondary">{deviation.summary}</p>
        {deviation.clauseTitle ? (
          <p className="text-xs text-text-muted">
            Approved clause: {deviation.clauseTitle}
          </p>
        ) : null}
      </div>

      <div className="mt-4 space-y-4">
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-md border border-border bg-surface-muted p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">
              Prior version
            </p>
            <p className="mt-2 whitespace-pre-wrap text-sm text-text-secondary">
              {deviation.baselineExcerpt ?? "No baseline excerpt available."}
            </p>
          </div>
          <div className="rounded-md border border-border bg-surface-muted p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">
              Counterparty redline
            </p>
            <p className="mt-2 whitespace-pre-wrap text-sm text-text-secondary">
              {deviation.counterpartyExcerpt ??
                "No counterparty excerpt available."}
            </p>
          </div>
        </div>

        {deviation.approvedClauseText ? (
          <div className="rounded-md border border-violet-200 bg-violet-50 p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-violet-700">
              Approved clause text
            </p>
            <p className="mt-2 whitespace-pre-wrap text-sm text-violet-900">
              {deviation.approvedClauseText}
            </p>
          </div>
        ) : null}

        <DeviationComments
          contractId={contractId}
          roundId={round.id}
          deviationId={deviation.id}
          comments={comments}
          onCommentAdded={onUpdated}
        />
      </div>
    </article>
  );
}

export function LegalReviewComparisonPanel({
  contractId,
  attachments,
}: LegalReviewComparisonPanelProps) {
  const [rounds, setRounds] = useState<LegalReviewRound[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedRoundId, setSelectedRoundId] = useState<string | null>(null);
  const [baselineAttachmentId, setBaselineAttachmentId] = useState("");
  const [counterpartyAttachmentId, setCounterpartyAttachmentId] = useState("");
  const [starting, setStarting] = useState(false);
  const [downloadingRedline, setDownloadingRedline] = useState(false);

  const comparableAttachments = useMemo(
    () =>
      attachments.filter((attachment) =>
        /\.(pdf|docx)$/i.test(attachment.fileName),
      ),
    [attachments],
  );

  const suggestedPairs = useMemo(
    () => findComparableAttachmentPairs(comparableAttachments),
    [comparableAttachments],
  );

  const selectedRound =
    rounds.find((round) => round.id === selectedRoundId) ?? rounds[0] ?? null;

  const loadRounds = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/contracts/${contractId}/legal-review`);
      const payload = (await response.json().catch(() => null)) as
        | { rounds?: LegalReviewRound[]; error?: string }
        | null;

      if (!response.ok) {
        throw new Error(payload?.error ?? "Unable to load legal review rounds.");
      }

      const nextRounds = payload?.rounds ?? [];
      setRounds(nextRounds);
      setSelectedRoundId((current) => current ?? nextRounds[0]?.id ?? null);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Unable to load legal review rounds.",
      );
    } finally {
      setLoading(false);
    }
  }, [contractId]);

  useEffect(() => {
    void loadRounds();
  }, [loadRounds]);

  useEffect(() => {
    const suggested = suggestedPairs[0];

    if (!suggested) {
      return;
    }

    setBaselineAttachmentId((current) => current || suggested.baseline.id);
    setCounterpartyAttachmentId(
      (current) => current || suggested.counterparty.id,
    );
  }, [suggestedPairs]);

  async function startRound(): Promise<void> {
    setStarting(true);
    setError(null);

    try {
      const response = await fetch(`/api/contracts/${contractId}/legal-review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          baselineAttachmentId,
          counterpartyAttachmentId,
          runComparison: true,
        }),
      });
      const payload = (await response.json().catch(() => null)) as
        | { round?: LegalReviewRound; comparisonError?: string; error?: string }
        | null;

      if (!response.ok) {
        throw new Error(payload?.error ?? "Unable to start legal review round.");
      }

      if (payload?.round) {
        setSelectedRoundId(payload.round.id);
      }

      if (payload?.comparisonError) {
        setError(payload.comparisonError);
      }

      await loadRounds();
    } catch (startError) {
      setError(
        startError instanceof Error
          ? startError.message
          : "Unable to start legal review round.",
      );
    } finally {
      setStarting(false);
    }
  }

  async function rerunComparison(roundId: string): Promise<void> {
    setStarting(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/contracts/${contractId}/legal-review/${roundId}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "compare" }),
        },
      );
      const payload = (await response.json().catch(() => null)) as
        | { error?: string }
        | null;

      if (!response.ok) {
        throw new Error(payload?.error ?? "Unable to rerun comparison.");
      }

      await loadRounds();
    } catch (compareError) {
      setError(
        compareError instanceof Error
          ? compareError.message
          : "Unable to rerun comparison.",
      );
    } finally {
      setStarting(false);
    }
  }

  async function downloadRedline(roundId: string): Promise<void> {
    setDownloadingRedline(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/contracts/${contractId}/legal-review/${roundId}/redline/download`,
      );
      const payload = (await response.json().catch(() => null)) as
        | { url?: string; fileName?: string; error?: string }
        | null;

      if (!response.ok || !payload?.url) {
        throw new Error(payload?.error ?? "Unable to download redline document.");
      }

      const fileName = payload.fileName ?? "legal-review-redline.docx";
      let downloadUrl = payload.url;

      if (!payload.url.startsWith("data:")) {
        const fileResponse = await fetch(payload.url);

        if (!fileResponse.ok) {
          throw new Error("Unable to download redline document.");
        }

        downloadUrl = URL.createObjectURL(await fileResponse.blob());
      }

      const anchor = document.createElement("a");
      anchor.href = downloadUrl;
      anchor.download = fileName;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();

      if (!payload.url.startsWith("data:")) {
        URL.revokeObjectURL(downloadUrl);
      }
    } catch (downloadError) {
      setError(
        downloadError instanceof Error
          ? downloadError.message
          : "Unable to download redline document.",
      );
    } finally {
      setDownloadingRedline(false);
    }
  }

  async function completeRound(roundId: string): Promise<void> {
    const response = await fetch(
      `/api/contracts/${contractId}/legal-review/${roundId}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "complete" }),
      },
    );
    const payload = (await response.json().catch(() => null)) as
      | { error?: string }
      | null;

    if (!response.ok) {
      setError(payload?.error ?? "Unable to complete legal review round.");
      return;
    }

    await loadRounds();
  }

  return (
    <section className="rounded-lg border border-border bg-surface p-6 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-foreground">
            Legal review comparison
          </h2>
          <p className="mt-1 text-sm text-text-secondary">
            Compare the prior agreement version with a counterparty redline, prioritize
            deviations, and track legal review rounds with threaded comments.
          </p>
        </div>
        <Link
          href={`/contracts/${contractId}/legal-review`}
          className="text-sm font-medium text-accent hover:underline"
        >
          Open full review workspace
        </Link>
      </div>

      {loading ? (
        <p className="mt-6 text-sm text-text-muted">Loading review rounds...</p>
      ) : null}

      {error ? <p className="mt-4 text-sm text-rose-600">{error}</p> : null}

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <label className="block text-sm">
          <span className="font-medium text-foreground">Prior version</span>
          <select
            value={baselineAttachmentId}
            onChange={(event) => setBaselineAttachmentId(event.target.value)}
            className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-2"
          >
            <option value="">Select attachment</option>
            {comparableAttachments.map((attachment) => (
              <option key={attachment.id} value={attachment.id}>
                {attachment.fileName}
                {attachment.versionNumber ? ` (v${attachment.versionNumber})` : ""}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="font-medium text-foreground">Counterparty redline</span>
          <select
            value={counterpartyAttachmentId}
            onChange={(event) => setCounterpartyAttachmentId(event.target.value)}
            className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-2"
          >
            <option value="">Select attachment</option>
            {comparableAttachments.map((attachment) => (
              <option key={attachment.id} value={attachment.id}>
                {attachment.fileName}
                {attachment.versionNumber ? ` (v${attachment.versionNumber})` : ""}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={
            starting || !baselineAttachmentId || !counterpartyAttachmentId
          }
          onClick={() => void startRound()}
          className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {starting ? "Starting..." : "Start review round"}
        </button>
        {selectedRound ? (
          <>
            <button
              type="button"
              disabled={starting}
              onClick={() => void rerunComparison(selectedRound.id)}
              className="rounded-md border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-surface-muted disabled:opacity-50"
            >
              Re-run comparison
            </button>
            {isRedlineDownloadReady(selectedRound) ? (
              <button
                type="button"
                disabled={downloadingRedline}
                onClick={() => void downloadRedline(selectedRound.id)}
                className="rounded-md border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-surface-muted disabled:opacity-50"
              >
                {downloadingRedline ? "Preparing redline..." : "Download redline"}
              </button>
            ) : null}
            {selectedRound.status === "open" ? (
              <button
                type="button"
                onClick={() => void completeRound(selectedRound.id)}
                className="rounded-md border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-surface-muted"
              >
                Complete round
              </button>
            ) : null}
          </>
        ) : null}
      </div>

      {rounds.length > 0 ? (
        <div className="mt-6 flex flex-wrap gap-2">
          {rounds.map((round) => (
            <button
              key={round.id}
              type="button"
              onClick={() => setSelectedRoundId(round.id)}
              className={`rounded-full px-3 py-1 text-xs font-medium ${
                selectedRound?.id === round.id
                  ? "bg-accent text-white"
                  : "bg-surface-muted text-text-secondary"
              }`}
            >
              Round {round.roundNumber} · {round.status}
            </button>
          ))}
        </div>
      ) : null}

      {selectedRound ? (
        <div className="mt-6 space-y-4">
          <div className="rounded-md border border-border bg-surface-muted p-4 text-sm">
            <p className="font-medium text-foreground">
              Round {selectedRound.roundNumber}: {selectedRound.baselineFileName} →{" "}
              {selectedRound.counterpartyFileName}
            </p>
            <p className="mt-1 text-text-secondary">
              {selectedRound.comparisonSummary ??
                "Comparison has not been run yet. PDF and Word files must contain extractable text."}
            </p>
            {selectedRound.documentReadiness.length > 0 ? (
              <ul className="mt-3 space-y-1 text-xs text-text-muted">
                {selectedRound.documentReadiness.map((item) => (
                  <li key={item.attachmentId}>
                    {item.fileName}:{" "}
                    {item.readable
                      ? `${item.characterCount.toLocaleString()} characters extracted`
                      : item.warning ?? "Not readable"}
                  </li>
                ))}
              </ul>
            ) : null}
            {isRedlineDownloadReady(selectedRound) ? (
              <p className="mt-3 text-xs text-text-secondary">
                Redline document ready: {selectedRound.redlineDocument!.fileName}
              </p>
            ) : selectedRound.comparedAt &&
              selectedRound.comparisonSummary?.includes(
                "Redline document could not be generated",
              ) ? (
              <p className="mt-3 text-xs text-amber-700">
                Redline document could not be generated for this comparison run.
              </p>
            ) : null}
          </div>

          {selectedRound.deviations.length === 0 ? (
            <p className="text-sm text-text-muted">
              {selectedRound.comparedAt
                ? "No material deviations were detected for this round."
                : "Comparison has not been run yet for this round."}
            </p>
          ) : (
            selectedRound.deviations.map((deviation) => (
              <DeviationCard
                key={deviation.id}
                contractId={contractId}
                round={selectedRound}
                deviation={deviation}
                comments={selectedRound.comments}
                onUpdated={() => void loadRounds()}
              />
            ))
          )}
        </div>
      ) : null}
    </section>
  );
}
