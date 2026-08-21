"use client";

import { diffWords } from "@/lib/legal-review-text-diff";
import {
  COMPARE_KIND_LABELS,
  COMPARE_KIND_STYLES,
} from "@/lib/legal-review-compare-view";
import type { LegalReviewDeviation } from "@/types/legal-review";

interface InlineRedlineTextProps {
  baseline?: string | null;
  counterparty?: string | null;
}

export function InlineRedlineText({
  baseline,
  counterparty,
}: InlineRedlineTextProps) {
  if (!baseline && !counterparty) {
    return (
      <span className="text-sm text-text-muted">No redline text available.</span>
    );
  }

  if (!baseline && counterparty) {
    return (
      <span className="whitespace-pre-wrap text-sm text-emerald-800 underline decoration-emerald-500">
        {counterparty}
      </span>
    );
  }

  if (baseline && !counterparty) {
    return (
      <span className="whitespace-pre-wrap text-sm text-rose-800 line-through decoration-rose-500">
        {baseline}
      </span>
    );
  }

  const parts = diffWords(baseline!, counterparty!);

  return (
    <span className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">
      {parts.map((part, index) => {
        if (part.kind === "equal") {
          return <span key={`${part.kind}-${index}`}>{part.text}</span>;
        }

        if (part.kind === "delete") {
          return (
            <span
              key={`${part.kind}-${index}`}
              className="text-rose-800 line-through decoration-rose-500"
            >
              {part.text}
            </span>
          );
        }

        return (
          <span
            key={`${part.kind}-${index}`}
            className="text-emerald-800 underline decoration-emerald-500"
          >
            {part.text}
          </span>
        );
      })}
    </span>
  );
}

interface ComparePaneProps {
  label: string;
  children: React.ReactNode;
  active?: boolean;
}

export function ComparePane({ label, children, active = false }: ComparePaneProps) {
  return (
    <div
      className={`flex min-h-48 flex-col rounded-md border bg-surface p-3 ${
        active ? "border-accent ring-1 ring-accent/30" : "border-border"
      }`}
    >
      <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">
        {label}
      </p>
      <div className="mt-3 flex-1 overflow-auto">{children}</div>
    </div>
  );
}

export function CompareChangeBadge({
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
        className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${COMPARE_KIND_STYLES[deviation.kind]}`}
      >
        {COMPARE_KIND_LABELS[deviation.kind]}
      </span>
    </div>
  );
}
