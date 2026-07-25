"use client";

import { useEffect, useState } from "react";
import {
  FormField,
  inputClassName,
  selectClassName,
  textareaClassName,
} from "@/components/ui/FormField";
import {
  CLAUSE_CATEGORIES,
  CLAUSE_STATUS_OPTIONS,
  CLAUSE_STATUS_LABELS,
  type ActiveClauseStatus,
  type ClauseRecord,
} from "@/types/clause-library";

export interface ClauseFormValues {
  title: string;
  category: string;
  contractTypes: string[];
  status: ActiveClauseStatus;
  preferredText: string;
  alternativeText: string;
  notes: string;
}

interface ClauseFormPanelProps {
  open: boolean;
  mode: "create" | "edit";
  contractTypes: string[];
  initialClause?: ClauseRecord | null;
  isSaving: boolean;
  error: string | null;
  onClose: () => void;
  onSubmit: (values: ClauseFormValues) => void;
}

const emptyValues: ClauseFormValues = {
  title: "",
  category: "",
  contractTypes: [],
  status: "approved",
  preferredText: "",
  alternativeText: "",
  notes: "",
};

function valuesFromClause(clause: ClauseRecord): ClauseFormValues {
  return {
    title: clause.title,
    category: clause.category,
    contractTypes: clause.contractTypes,
    status:
      clause.status === "deprecated" ? "approved" : (clause.status as ActiveClauseStatus),
    preferredText: clause.preferredText,
    alternativeText: clause.alternativeText ?? "",
    notes: clause.notes ?? "",
  };
}

const monospaceTextareaClassName = `${textareaClassName} font-mono`;

export function ClauseFormPanel({
  open,
  mode,
  contractTypes,
  initialClause,
  isSaving,
  error,
  onClose,
  onSubmit,
}: ClauseFormPanelProps) {
  const [values, setValues] = useState<ClauseFormValues>(emptyValues);

  useEffect(() => {
    if (!open) {
      return;
    }

    setValues(
      mode === "edit" && initialClause
        ? valuesFromClause(initialClause)
        : emptyValues,
    );
  }, [open, mode, initialClause]);

  useEffect(() => {
    if (!open) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === "Escape") {
        onClose();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  if (!open) {
    return null;
  }

  function toggleContractType(contractType: string): void {
    setValues((current) => ({
      ...current,
      contractTypes: current.contractTypes.includes(contractType)
        ? current.contractTypes.filter((value) => value !== contractType)
        : [...current.contractTypes, contractType],
    }));
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    onSubmit(values);
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button
        type="button"
        aria-label="Close clause form"
        className="absolute inset-0 bg-slate-900/40"
        onClick={onClose}
      />

      <div className="relative flex h-full w-full max-w-xl flex-col bg-white shadow-2xl">
        <div className="border-b border-slate-200 px-6 py-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">
                {mode === "create" ? "New clause" : "Edit clause"}
              </h2>
              <p className="mt-1 text-sm text-slate-600">
                Maintain approved language and negotiation guidance for your
                clause library.
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-md px-2 py-1 text-sm text-slate-500 hover:bg-slate-100 hover:text-slate-900"
            >
              Close
            </button>
          </div>
        </div>

        <form
          onSubmit={handleSubmit}
          className="flex flex-1 flex-col overflow-hidden"
        >
          <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
            <FormField label="Title" htmlFor="clause-title">
              <input
                id="clause-title"
                type="text"
                required
                value={values.title}
                onChange={(event) =>
                  setValues((current) => ({
                    ...current,
                    title: event.target.value,
                  }))
                }
                className={inputClassName}
              />
            </FormField>

            <FormField label="Category" htmlFor="clause-category">
              <select
                id="clause-category"
                required
                value={values.category}
                onChange={(event) =>
                  setValues((current) => ({
                    ...current,
                    category: event.target.value,
                  }))
                }
                className={selectClassName}
              >
                <option value="">Select a category</option>
                {CLAUSE_CATEGORIES.map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </select>
            </FormField>

            <FormField
              label="Applies to contract types"
              htmlFor="clause-contract-types"
            >
              <div
                id="clause-contract-types"
                className="max-h-48 space-y-2 overflow-y-auto rounded-md border border-slate-200 bg-slate-50 p-3"
              >
                {contractTypes.map((contractType) => (
                  <label
                    key={contractType}
                    className="flex items-center gap-2 text-sm text-slate-700"
                  >
                    <input
                      type="checkbox"
                      checked={values.contractTypes.includes(contractType)}
                      onChange={() => toggleContractType(contractType)}
                      className="h-4 w-4 rounded border-slate-300 text-indigo-600"
                    />
                    {contractType}
                  </label>
                ))}
              </div>
            </FormField>

            <FormField label="Status" htmlFor="clause-status">
              <select
                id="clause-status"
                required
                value={values.status}
                onChange={(event) =>
                  setValues((current) => ({
                    ...current,
                    status: event.target.value as ActiveClauseStatus,
                  }))
                }
                className={selectClassName}
              >
                {CLAUSE_STATUS_OPTIONS.map((status) => (
                  <option key={status} value={status}>
                    {CLAUSE_STATUS_LABELS[status]}
                  </option>
                ))}
              </select>
            </FormField>

            <FormField label="Preferred text" htmlFor="clause-preferred-text">
              <textarea
                id="clause-preferred-text"
                required
                rows={8}
                value={values.preferredText}
                onChange={(event) =>
                  setValues((current) => ({
                    ...current,
                    preferredText: event.target.value,
                  }))
                }
                className={monospaceTextareaClassName}
              />
            </FormField>

            <FormField
              label="Alternative text"
              htmlFor="clause-alternative-text"
              hint="Optional fallback language."
            >
              <textarea
                id="clause-alternative-text"
                rows={6}
                value={values.alternativeText}
                onChange={(event) =>
                  setValues((current) => ({
                    ...current,
                    alternativeText: event.target.value,
                  }))
                }
                className={monospaceTextareaClassName}
              />
            </FormField>

            <FormField
              label="Notes for negotiators"
              htmlFor="clause-notes"
              hint="Optional internal guidance."
            >
              <textarea
                id="clause-notes"
                rows={4}
                value={values.notes}
                onChange={(event) =>
                  setValues((current) => ({
                    ...current,
                    notes: event.target.value,
                  }))
                }
                className={textareaClassName}
              />
            </FormField>

            {error ? (
              <div className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
                {error}
              </div>
            ) : null}
          </div>

          <div className="flex items-center justify-end gap-3 border-t border-slate-200 px-6 py-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
            >
              {isSaving ? "Saving..." : mode === "create" ? "Create clause" : "Save changes"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
