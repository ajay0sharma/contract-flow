"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { formatContractDateTime } from "@/lib/format-dates";
import { findComparableAttachmentPairs } from "@/lib/legal-review-utils";
import { VersionCompareViewer } from "@/components/contracts/VersionCompareViewer";
import type { ContractAttachment } from "@/types/contract";
import type {
  LegalReviewRound,
  LegalReviewRoundStatus,
} from "@/types/legal-review";

interface LegalReviewComparisonPanelProps {
  contractId: string;
  attachments: ContractAttachment[];
  showPageLink?: boolean;
}

function isRedlineDownloadReady(round: LegalReviewRound): boolean {
  if (!round.comparedAt || !round.redlineDocument) {
    return false;
  }

  return !round.comparisonSummary?.includes(
    "Redline document could not be generated",
  );
}

function formatRoundStatus(status: LegalReviewRoundStatus): string {
  switch (status) {
    case "open":
      return "In progress";
    case "completed":
      return "Reviewed";
    case "superseded":
      return "Archived";
    default:
      return status;
  }
}

export function LegalReviewComparisonPanel({
  contractId,
  attachments,
  showPageLink = true,
}: LegalReviewComparisonPanelProps) {
  const [rounds, setRounds] = useState<LegalReviewRound[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedRoundId, setSelectedRoundId] = useState<string | null>(null);
  const [baselineAttachmentId, setBaselineAttachmentId] = useState("");
  const [counterpartyAttachmentId, setCounterpartyAttachmentId] = useState("");
  const [starting, setStarting] = useState(false);
  const [downloadingExport, setDownloadingExport] = useState<string | null>(null);

  async function downloadFromApi(path: string, fallbackFileName: string): Promise<void> {
    setDownloadingExport(path);
    setError(null);

    try {
      const response = await fetch(path);
      const payload = (await response.json().catch(() => null)) as
        | { url?: string; fileName?: string; error?: string }
        | null;

      if (!response.ok || !payload?.url) {
        throw new Error(payload?.error ?? "Unable to download redline.");
      }

      const fileName = payload.fileName ?? fallbackFileName;
      let downloadUrl = payload.url;

      if (!payload.url.startsWith("data:")) {
        const fileResponse = await fetch(payload.url);

        if (!fileResponse.ok) {
          throw new Error("Unable to download redline.");
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
          : "Unable to download redline.",
      );
    } finally {
      setDownloadingExport(null);
    }
  }

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
        throw new Error(payload?.error ?? "Unable to load comparisons.");
      }

      const nextRounds = payload?.rounds ?? [];
      setRounds(nextRounds);
      setSelectedRoundId((current) => current ?? nextRounds[0]?.id ?? null);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Unable to load comparisons.",
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
        throw new Error(payload?.error ?? "Unable to compare versions.");
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
          : "Unable to compare versions.",
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
    await downloadFromApi(
      `/api/contracts/${contractId}/legal-review/${roundId}/redline/download`,
      "version-compare-redline.docx",
    );
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
      setError(payload?.error ?? "Unable to mark comparison as reviewed.");
      return;
    }

    await loadRounds();
  }

  return (
    <section className="rounded-lg border border-border bg-surface p-6 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-foreground">
            Compare versions
          </h2>
          <p className="mt-1 text-sm text-text-secondary">
            See what changed between your last version and a counterparty&apos;s
            edits. Download a redline to share with your advisor, then mark the
            comparison as reviewed.
          </p>
        </div>
        {showPageLink ? (
          <Link
            href={`/contracts/${contractId}/legal-review`}
            className="text-sm font-medium text-accent hover:underline"
          >
            Open compare page
          </Link>
        ) : null}
      </div>

      {loading ? (
        <p className="mt-6 text-sm text-text-muted">Loading comparisons...</p>
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
          {starting ? "Comparing..." : "Compare versions"}
        </button>
        {selectedRound ? (
          <>
            <button
              type="button"
              disabled={starting}
              onClick={() => void rerunComparison(selectedRound.id)}
              className="rounded-md border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-surface-muted disabled:opacity-50"
            >
              Refresh comparison
            </button>
            {isRedlineDownloadReady(selectedRound) ? (
              <button
                type="button"
                disabled={Boolean(downloadingExport)}
                onClick={() => void downloadRedline(selectedRound.id)}
                className="rounded-md border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-surface-muted disabled:opacity-50"
              >
                {downloadingExport?.includes("redline/download")
                  ? "Preparing..."
                  : "Download redline"}
              </button>
            ) : null}
            {selectedRound.status === "open" ? (
              <button
                type="button"
                onClick={() => void completeRound(selectedRound.id)}
                className="rounded-md border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-surface-muted"
              >
                Mark as reviewed
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
              Comparison {round.roundNumber} · {formatRoundStatus(round.status)}
            </button>
          ))}
        </div>
      ) : null}

      {selectedRound ? (
        <div className="mt-6 space-y-4">
          <div className="rounded-md border border-border bg-surface-muted p-4 text-sm">
            <p className="font-medium text-foreground">
              Comparison {selectedRound.roundNumber}: {selectedRound.baselineFileName}{" "}
              → {selectedRound.counterpartyFileName}
            </p>
            {selectedRound.comparedAt ? (
              <p className="mt-1 text-xs text-text-muted">
                Compared {formatContractDateTime(selectedRound.comparedAt)}
              </p>
            ) : null}
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
                ? "No material changes were detected between these versions."
                : "Comparison has not been run yet for this comparison."}
            </p>
          ) : (
            <VersionCompareViewer key={selectedRound.id} round={selectedRound} />
          )}
        </div>
      ) : null}
    </section>
  );
}
