"use client";

import { useMemo, useState } from "react";
import { ClauseFormPanel, type ClauseFormValues } from "@/components/clause-library/ClauseFormPanel";
import { ClauseStatusBadge } from "@/components/clause-library/ClauseStatusBadge";
import { inputClassName, selectClassName } from "@/components/ui/FormField";
import {
  CLAUSE_CATEGORIES,
  CLAUSE_STATUS_LABELS,
  type ClauseRecord,
} from "@/types/clause-library";
import type { ClauseStatus } from "@/lib/generated/prisma/enums";

interface ClauseLibraryClientProps {
  initialClauses: ClauseRecord[];
  contractTypes: string[];
  organizationId: string;
}

interface MultiSelectFilterProps {
  label: string;
  options: { value: string; label: string }[];
  selected: string[];
  onChange: (values: string[]) => void;
}

function MultiSelectFilter({
  label,
  options,
  selected,
  onChange,
}: MultiSelectFilterProps) {
  const [open, setOpen] = useState(false);
  const summary =
    selected.length === 0
      ? `All ${label.toLowerCase()}`
      : `${selected.length} selected`;

  function toggleValue(value: string): void {
    onChange(
      selected.includes(value)
        ? selected.filter((entry) => entry !== value)
        : [...selected, value],
    );
  }

  return (
    <div className="relative">
      <label className="block text-sm">
        <span className="mb-2 block font-medium text-slate-700">{label}</span>
        <button
          type="button"
          onClick={() => setOpen((current) => !current)}
          className={`${selectClassName} text-left`}
        >
          {summary}
        </button>
      </label>

      {open ? (
        <>
          <button
            type="button"
            aria-label={`Close ${label} filter`}
            className="fixed inset-0 z-10 cursor-default"
            onClick={() => setOpen(false)}
          />
          <div className="absolute z-20 mt-2 max-h-56 w-full overflow-y-auto rounded-md border border-slate-200 bg-white p-3 shadow-lg">
            {options.map((option) => (
              <label
                key={option.value}
                className="flex items-center gap-2 py-1 text-sm text-slate-700"
              >
                <input
                  type="checkbox"
                  checked={selected.includes(option.value)}
                  onChange={() => toggleValue(option.value)}
                  className="h-4 w-4 rounded border-slate-300 text-indigo-600"
                />
                {option.label}
              </label>
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}

function formatReviewedDate(value: string | null): string {
  if (!value) {
    return "Not reviewed";
  }

  return new Date(value).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function previewText(text: string, length = 150): string {
  const normalized = text.replace(/\s+/g, " ").trim();

  if (normalized.length <= length) {
    return normalized;
  }

  return `${normalized.slice(0, length).trimEnd()}...`;
}

function matchesSearch(clause: ClauseRecord, query: string): boolean {
  const terms = query
    .toLowerCase()
    .split(/\s+/)
    .map((term) => term.trim())
    .filter(Boolean);

  if (terms.length === 0) {
    return true;
  }

  const haystack = [
    clause.title,
    clause.preferredText,
    clause.alternativeText ?? "",
    clause.notes ?? "",
    clause.category,
  ]
    .join(" ")
    .toLowerCase();

  return terms.every((term) => haystack.includes(term));
}

interface ClauseCardProps {
  clause: ClauseRecord;
  expanded: boolean;
  isArchiving: boolean;
  onToggleExpand: () => void;
  onEdit: () => void;
  onArchive: () => void;
}

function ClauseCard({
  clause,
  expanded,
  isArchiving,
  onToggleExpand,
  onEdit,
  onArchive,
}: ClauseCardProps) {
  return (
    <article className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <button
        type="button"
        onClick={onToggleExpand}
        className="w-full px-5 py-4 text-left"
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-base font-semibold text-slate-900">
                {clause.title}
              </h3>
              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700 ring-1 ring-inset ring-slate-200">
                {clause.category}
              </span>
              <ClauseStatusBadge status={clause.status} />
            </div>
            <p className="mt-3 text-sm leading-6 text-slate-600">
              {previewText(clause.preferredText)}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {clause.contractTypes.map((contractType) => (
                <span
                  key={contractType}
                  className="rounded-full bg-indigo-50 px-2 py-0.5 text-xs text-indigo-700 ring-1 ring-inset ring-indigo-100"
                >
                  {contractType}
                </span>
              ))}
            </div>
            <p className="mt-3 text-xs text-slate-500">
              Last reviewed {formatReviewedDate(clause.lastReviewedAt)}
            </p>
          </div>
        </div>
      </button>

      {expanded ? (
        <div className="border-t border-slate-200 px-5 py-4">
          <div className="space-y-4">
            <div>
              <h4 className="text-sm font-semibold text-slate-900">
                Preferred text
              </h4>
              <pre className="mt-2 whitespace-pre-wrap rounded-md bg-slate-50 p-4 font-mono text-sm leading-6 text-slate-700">
                {clause.preferredText}
              </pre>
            </div>

            {clause.alternativeText ? (
              <div>
                <h4 className="text-sm font-semibold text-slate-900">
                  Alternative text
                </h4>
                <pre className="mt-2 whitespace-pre-wrap rounded-md bg-slate-50 p-4 font-mono text-sm leading-6 text-slate-700">
                  {clause.alternativeText}
                </pre>
              </div>
            ) : null}

            {clause.notes ? (
              <div>
                <h4 className="text-sm font-semibold text-slate-900">
                  Notes for negotiators
                </h4>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  {clause.notes}
                </p>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="flex items-center justify-end gap-2 border-t border-slate-200 px-5 py-3">
        {clause.status !== "deprecated" ? (
          <>
            <button
              type="button"
              onClick={onEdit}
              className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Edit
            </button>
            <button
              type="button"
              onClick={onArchive}
              disabled={isArchiving}
              className="rounded-md border border-rose-200 px-3 py-1.5 text-sm font-medium text-rose-700 hover:bg-rose-50 disabled:opacity-60"
            >
              {isArchiving ? "Archiving..." : "Archive"}
            </button>
          </>
        ) : null}
      </div>
    </article>
  );
}

export function ClauseLibraryClient({
  initialClauses,
  contractTypes,
  organizationId,
}: ClauseLibraryClientProps) {
  const [clauses, setClauses] = useState(initialClauses);
  const [query, setQuery] = useState("");
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [selectedContractTypes, setSelectedContractTypes] = useState<string[]>(
    [],
  );
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [panelMode, setPanelMode] = useState<"create" | "edit">("create");
  const [editingClause, setEditingClause] = useState<ClauseRecord | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [archivingId, setArchivingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const statusOptions = useMemo(
    () =>
      (
        [
          "approved",
          "approved_with_modification",
          "non_standard",
          "deprecated",
        ] as ClauseStatus[]
      ).map((status) => ({
        value: status,
        label: CLAUSE_STATUS_LABELS[status],
      })),
    [],
  );

  const filteredClauses = useMemo(() => {
    return clauses.filter((clause) => {
      if (!matchesSearch(clause, query)) {
        return false;
      }

      if (
        selectedCategories.length > 0 &&
        !selectedCategories.includes(clause.category)
      ) {
        return false;
      }

      if (
        selectedContractTypes.length > 0 &&
        !clause.contractTypes.some((contractType) =>
          selectedContractTypes.includes(contractType),
        )
      ) {
        return false;
      }

      if (
        selectedStatuses.length > 0 &&
        !selectedStatuses.includes(clause.status)
      ) {
        return false;
      }

      return true;
    });
  }, [
    clauses,
    query,
    selectedCategories,
    selectedContractTypes,
    selectedStatuses,
  ]);

  function openCreatePanel(): void {
    setPanelMode("create");
    setEditingClause(null);
    setError(null);
    setPanelOpen(true);
  }

  function openEditPanel(clause: ClauseRecord): void {
    setPanelMode("edit");
    setEditingClause(clause);
    setError(null);
    setPanelOpen(true);
  }

  async function refreshClauses(): Promise<void> {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/clause-library");
      const payload = (await response.json()) as {
        clauses?: ClauseRecord[];
        error?: string;
      };

      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to load clauses.");
      }

      setClauses(payload.clauses ?? []);
    } catch (refreshError) {
      setError(
        refreshError instanceof Error
          ? refreshError.message
          : "Unable to load clauses.",
      );
      throw refreshError;
    } finally {
      setIsLoading(false);
    }
  }

  async function handleSubmit(values: ClauseFormValues): Promise<void> {
    setIsSaving(true);
    setError(null);

    try {
      const payload = {
        title: values.title,
        category: values.category,
        contractTypes: values.contractTypes,
        status: values.status,
        preferredText: values.preferredText,
        alternativeText: values.alternativeText || null,
        notes: values.notes || null,
      };

      const response = await fetch(
        panelMode === "create"
          ? "/api/clause-library"
          : `/api/clause-library/${editingClause?.id}`,
        {
          method: panelMode === "create" ? "POST" : "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );

      const body = (await response.json()) as {
        clause?: ClauseRecord;
        error?: string;
      };

      if (!response.ok) {
        throw new Error(body.error ?? "Unable to save clause.");
      }

      await refreshClauses();
      setPanelOpen(false);
      setEditingClause(null);
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Unable to save clause.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function handleArchive(clause: ClauseRecord): Promise<void> {
    const confirmed = window.confirm(
      `Archive "${clause.title}"? It will be marked as deprecated but not deleted.`,
    );

    if (!confirmed) {
      return;
    }

    setArchivingId(clause.id);
    setError(null);

    try {
      const response = await fetch(`/api/clause-library/${clause.id}`, {
        method: "DELETE",
      });
      const body = (await response.json()) as { error?: string };

      if (!response.ok) {
        throw new Error(body.error ?? "Unable to archive clause.");
      }

      await refreshClauses();
      if (expandedId === clause.id) {
        setExpandedId(null);
      }
    } catch (archiveError) {
      setError(
        archiveError instanceof Error
          ? archiveError.message
          : "Unable to archive clause.",
      );
    } finally {
      setArchivingId(null);
    }
  }

  const hasActiveFilters =
    query.trim().length > 0 ||
    selectedCategories.length > 0 ||
    selectedContractTypes.length > 0 ||
    selectedStatuses.length > 0;

  return (
    <>
      <div className="space-y-6" data-organization-id={organizationId}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm text-slate-600">
              {isLoading
                ? "Refreshing clauses..."
                : `${filteredClauses.length} of ${clauses.length} clauses`}
            </p>
          </div>
          <button
            type="button"
            onClick={openCreatePanel}
            disabled={isLoading}
            className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
          >
            New clause
          </button>
        </div>

        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="grid gap-4 lg:grid-cols-[2fr_1fr_1fr_1fr]">
            <label className="block text-sm">
              <span className="mb-2 block font-medium text-slate-700">
                Search
              </span>
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search by title or clause text"
                className={inputClassName}
              />
            </label>

            <MultiSelectFilter
              label="Category"
              options={CLAUSE_CATEGORIES.map((category) => ({
                value: category,
                label: category,
              }))}
              selected={selectedCategories}
              onChange={setSelectedCategories}
            />

            <MultiSelectFilter
              label="Contract type"
              options={contractTypes.map((contractType) => ({
                value: contractType,
                label: contractType,
              }))}
              selected={selectedContractTypes}
              onChange={setSelectedContractTypes}
            />

            <MultiSelectFilter
              label="Status"
              options={statusOptions}
              selected={selectedStatuses}
              onChange={setSelectedStatuses}
            />
          </div>
        </section>

        {error && !panelOpen ? (
          <div className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
            {error}
          </div>
        ) : null}

        <div className="space-y-4">
          {isLoading && clauses.length === 0 ? (
            <div className="rounded-xl border border-slate-200 bg-white px-6 py-12 text-center">
              <p className="text-sm text-slate-600">Loading clause library...</p>
            </div>
          ) : filteredClauses.length > 0 ? (
            filteredClauses.map((clause) => (
              <ClauseCard
                key={clause.id}
                clause={clause}
                expanded={expandedId === clause.id}
                isArchiving={archivingId === clause.id}
                onToggleExpand={() =>
                  setExpandedId((current) =>
                    current === clause.id ? null : clause.id,
                  )
                }
                onEdit={() => openEditPanel(clause)}
                onArchive={() => handleArchive(clause)}
              />
            ))
          ) : clauses.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center">
              <h3 className="text-base font-semibold text-slate-900">
                No clauses yet
              </h3>
              <p className="mt-2 text-sm text-slate-600">
                Create your first approved clause to build your organization&apos;s
                clause library.
              </p>
              <button
                type="button"
                onClick={openCreatePanel}
                className="mt-4 rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
              >
                Create first clause
              </button>
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center">
              <p className="text-sm text-slate-600">
                {hasActiveFilters
                  ? "No clauses match your current filters."
                  : "No clauses to display."}
              </p>
              {hasActiveFilters ? (
                <button
                  type="button"
                  onClick={() => {
                    setQuery("");
                    setSelectedCategories([]);
                    setSelectedContractTypes([]);
                    setSelectedStatuses([]);
                  }}
                  className="mt-4 rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  Clear filters
                </button>
              ) : null}
            </div>
          )}
        </div>
      </div>

      <ClauseFormPanel
        open={panelOpen}
        mode={panelMode}
        contractTypes={contractTypes}
        initialClause={editingClause}
        isSaving={isSaving}
        error={error}
        onClose={() => {
          setPanelOpen(false);
          setEditingClause(null);
          setError(null);
        }}
        onSubmit={handleSubmit}
      />
    </>
  );
}
