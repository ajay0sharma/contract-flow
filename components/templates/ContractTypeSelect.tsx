"use client";

import { useCallback, useMemo, useState } from "react";
import { useDeferredEffect } from "@/lib/use-deferred-effect";
import type { ContractTypeRecord } from "@/types/contract-template";
import { inputClassName, selectClassName } from "@/components/ui/FormField";

interface ContractTypeSelectProps {
  value: string;
  onChange: (slug: string) => void;
  organizationId: string;
  isLegalUser?: boolean;
  initialContractTypes?: ContractTypeRecord[];
  className?: string;
  allowCreate?: boolean;
  onContractTypesChange?: (contractTypes: ContractTypeRecord[]) => void;
}

export function ContractTypeSelect({
  value,
  onChange,
  organizationId,
  isLegalUser = false,
  initialContractTypes = [],
  className,
  allowCreate = true,
  onContractTypesChange,
}: ContractTypeSelectProps) {
  const [contractTypes, setContractTypes] =
    useState<ContractTypeRecord[]>(initialContractTypes);
  const [loading, setLoading] = useState(initialContractTypes.length === 0);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newTypeLabel, setNewTypeLabel] = useState("");
  const [newTypeDescription, setNewTypeDescription] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const refreshContractTypes = useCallback(async () => {
    setLoading(true);

    try {
      const response = await fetch(
        `/api/contract-types?organizationId=${encodeURIComponent(organizationId)}`,
      );

      if (!response.ok) {
        return;
      }

      const payload = (await response.json()) as {
        contractTypes?: ContractTypeRecord[];
      };

      if (Array.isArray(payload.contractTypes)) {
        setContractTypes(payload.contractTypes);
        onContractTypesChange?.(payload.contractTypes);
      }
    } finally {
      setLoading(false);
    }
  }, [organizationId, onContractTypesChange]);

  useDeferredEffect(() => {
    if (initialContractTypes.length === 0) {
      void refreshContractTypes();
    }
  }, [initialContractTypes.length, refreshContractTypes]);

  const sortedTypes = useMemo(
    () =>
      [...contractTypes].sort((left, right) => {
        if (left.displayOrder !== right.displayOrder) {
          return left.displayOrder - right.displayOrder;
        }

        return left.label.localeCompare(right.label);
      }),
    [contractTypes],
  );

  async function handleCreateType(): Promise<void> {
    const label = newTypeLabel.trim();

    if (!label) {
      setCreateError("Enter a name for the new contract type.");
      return;
    }

    setCreating(true);
    setCreateError(null);

    try {
      const response = await fetch("/api/contract-types", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organizationId,
          label,
          description: newTypeDescription.trim() || null,
        }),
      });

      const payload = (await response.json()) as {
        contractType?: ContractTypeRecord;
        error?: string;
      };

      if (!response.ok || !payload.contractType) {
        setCreateError(payload.error ?? "Unable to create contract type.");
        return;
      }

      setContractTypes((current) => {
        const next = [...current, payload.contractType!].sort((left, right) => {
          if (left.displayOrder !== right.displayOrder) {
            return left.displayOrder - right.displayOrder;
          }

          return left.label.localeCompare(right.label);
        });
        onContractTypesChange?.(next);
        return next;
      });
      onChange(payload.contractType.slug);
      setNewTypeLabel("");
      setNewTypeDescription("");
      setShowCreateForm(false);
    } catch {
      setCreateError("Unable to create contract type. Please try again.");
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="space-y-3">
      <select
        value={value}
        onChange={(event) => {
          if (event.target.value === "__create__") {
            setShowCreateForm(true);
            setCreateError(null);
            return;
          }

          onChange(event.target.value);
        }}
        disabled={loading || creating}
        className={className ?? selectClassName}
      >
        {sortedTypes.map((type) => (
          <option key={type.id} value={type.slug}>
            {type.label}
          </option>
        ))}
        {isLegalUser && allowCreate ? (
          <option value="__create__">+ Add new contract type...</option>
        ) : null}
      </select>

      {isLegalUser && allowCreate && showCreateForm ? (
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
          <p className="text-sm font-medium text-slate-800">
            Add a new contract type
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Saved types appear in this dropdown for all future templates.
          </p>

          <label className="mt-3 block text-sm">
            <span className="mb-1 block font-medium text-slate-700">Name</span>
            <input
              type="text"
              value={newTypeLabel}
              onChange={(event) => setNewTypeLabel(event.target.value)}
              placeholder="e.g. Master Lease"
              className={inputClassName}
            />
          </label>

          <label className="mt-3 block text-sm">
            <span className="mb-1 block font-medium text-slate-700">
              Description (optional)
            </span>
            <input
              type="text"
              value={newTypeDescription}
              onChange={(event) => setNewTypeDescription(event.target.value)}
              placeholder="Shown when selecting this type"
              className={inputClassName}
            />
          </label>

          {createError ? (
            <p className="mt-3 text-sm text-red-600">{createError}</p>
          ) : null}

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={creating}
              onClick={() => void handleCreateType()}
              className="rounded-md bg-[#3558A0] px-3 py-2 text-sm font-medium text-white hover:bg-[#2a4a8f] disabled:opacity-60"
            >
              {creating ? "Saving..." : "Save type"}
            </button>
            <button
              type="button"
              disabled={creating}
              onClick={() => {
                setShowCreateForm(false);
                setCreateError(null);
                setNewTypeLabel("");
                setNewTypeDescription("");
              }}
              className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-60"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
