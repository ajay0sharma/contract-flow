"use client";

import { useMemo, useState, useTransition } from "react";
import {
  createAdminContractTypeAction,
  deleteAdminContractTypeAction,
  updateAdminContractTypeAction,
} from "@/app/actions/admin";
import type { ContractTypeRecord } from "@/types/contract-template";

interface ContractTypesAdminFormProps {
  initialTypes: ContractTypeRecord[];
}

export function ContractTypesAdminForm({
  initialTypes,
}: ContractTypesAdminFormProps) {
  const [types, setTypes] = useState(initialTypes);
  const [newLabel, setNewLabel] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newCanBeParent, setNewCanBeParent] = useState(false);
  const [newRequiresParent, setNewRequiresParent] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const sortedTypes = useMemo(
    () =>
      [...types].sort((left, right) => {
        if (left.displayOrder !== right.displayOrder) {
          return left.displayOrder - right.displayOrder;
        }

        return left.label.localeCompare(right.label);
      }),
    [types],
  );

  function handleCreate(event: React.FormEvent) {
    event.preventDefault();
    setMessage(null);
    setError(null);

    const label = newLabel.trim();

    if (!label) {
      setError("Enter a name for the new contract type.");
      return;
    }

    startTransition(async () => {
      try {
        const created = await createAdminContractTypeAction({
          label,
          description: newDescription.trim() || null,
          canBeParentAgreement: newCanBeParent,
          requiresParentAgreement: newRequiresParent,
        });

        setTypes((current) => [...current, created]);
        setNewLabel("");
        setNewDescription("");
        setNewCanBeParent(false);
        setNewRequiresParent(false);
        setMessage(`Added contract type "${created.label}".`);
      } catch (createError) {
        setError(
          createError instanceof Error
            ? createError.message
            : "Unable to create contract type.",
        );
      }
    });
  }

  function handleToggle(
    type: ContractTypeRecord,
    field: "canBeParentAgreement" | "requiresParentAgreement",
  ) {
    setMessage(null);
    setError(null);

    const nextValue = !type[field];

    startTransition(async () => {
      try {
        const updated = await updateAdminContractTypeAction({
          id: type.id,
          [field]: nextValue,
        });

        setTypes((current) =>
          current.map((entry) => (entry.id === updated.id ? updated : entry)),
        );
        setMessage(`Updated "${updated.label}".`);
      } catch (updateError) {
        setError(
          updateError instanceof Error
            ? updateError.message
            : "Unable to update contract type.",
        );
      }
    });
  }

  function handleDelete(type: ContractTypeRecord) {
    const confirmed = window.confirm(
      type.isActive
        ? `Delete "${type.label}"? If it is used by contracts or templates, it will be deactivated instead.`
        : `Remove "${type.label}" from the list?`,
    );

    if (!confirmed) {
      return;
    }

    setMessage(null);
    setError(null);

    startTransition(async () => {
      try {
        const result = await deleteAdminContractTypeAction(type.id);

        if (result.deleted) {
          setTypes((current) => current.filter((entry) => entry.id !== type.id));
          setMessage(`Deleted "${type.label}".`);
          return;
        }

        if (result.type) {
          setTypes((current) =>
            current.map((entry) =>
              entry.id === result.type?.id ? result.type : entry,
            ),
          );
          setMessage(
            `"${type.label}" is in use and was deactivated instead of deleted.`,
          );
          return;
        }

        setMessage(`Removed "${type.label}".`);
      } catch (deleteError) {
        setError(
          deleteError instanceof Error
            ? deleteError.message
            : "Unable to delete contract type.",
        );
      }
    });
  }

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-stone-200 bg-white p-6 shadow-sm">
        <h3 className="text-base font-semibold text-stone-900">
          Add contract type
        </h3>
        <p className="mt-1 text-sm text-stone-600">
          Create agreement types for intake and define whether each one can
          serve as a parent agreement or must link to an existing parent.
        </p>

        <form onSubmit={handleCreate} className="mt-4 space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <label className="block text-sm">
              <span className="font-medium text-stone-700">Type name</span>
              <input
                type="text"
                value={newLabel}
                onChange={(event) => setNewLabel(event.target.value)}
                placeholder="For example, Master Lease"
                className="mt-1 w-full rounded-md border border-stone-300 px-3 py-2 text-stone-900"
              />
            </label>
            <label className="block text-sm md:col-span-2">
              <span className="font-medium text-stone-700">
                Description (optional)
              </span>
              <input
                type="text"
                value={newDescription}
                onChange={(event) => setNewDescription(event.target.value)}
                placeholder="Short description shown during intake"
                className="mt-1 w-full rounded-md border border-stone-300 px-3 py-2 text-stone-900"
              />
            </label>
          </div>

          <div className="flex flex-wrap gap-6 text-sm text-stone-700">
            <label className="inline-flex items-center gap-2">
              <input
                type="checkbox"
                checked={newCanBeParent}
                onChange={(event) => setNewCanBeParent(event.target.checked)}
                className="h-4 w-4 rounded border-stone-300 text-stone-900"
              />
              Parent agreement
            </label>
            <label className="inline-flex items-center gap-2">
              <input
                type="checkbox"
                checked={newRequiresParent}
                onChange={(event) =>
                  setNewRequiresParent(event.target.checked)
                }
                className="h-4 w-4 rounded border-stone-300 text-stone-900"
              />
              Child agreement (requires parent link)
            </label>
          </div>

          <button
            type="submit"
            disabled={isPending}
            className="rounded-md bg-stone-900 px-4 py-2 text-sm font-medium text-white hover:bg-stone-800 disabled:opacity-60"
          >
            {isPending ? "Adding..." : "Add contract type"}
          </button>
        </form>
      </section>

      <section className="rounded-lg border border-stone-200 bg-white p-6 shadow-sm">
        <h3 className="text-base font-semibold text-stone-900">
          Contract types
        </h3>
        <p className="mt-1 text-sm text-stone-600">
          Remove agreement types that are no longer needed. Types referenced by
          contracts or templates are deactivated instead of permanently deleted.
        </p>

        <div className="mt-4 overflow-hidden rounded-md border border-stone-200">
          <table className="min-w-full divide-y divide-stone-200 text-sm">
            <thead className="bg-stone-50 text-left text-stone-600">
              <tr>
                <th className="px-4 py-3 font-medium">Type</th>
                <th className="px-4 py-3 font-medium">Parent</th>
                <th className="px-4 py-3 font-medium">Child</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {sortedTypes.map((type) => (
                <tr key={type.id} className={type.isActive ? "" : "opacity-60"}>
                  <td className="px-4 py-3">
                    <p className="font-medium text-stone-900">{type.label}</p>
                    {type.description ? (
                      <p className="mt-1 text-xs text-stone-500">
                        {type.description}
                      </p>
                    ) : null}
                    {type.isSystem ? (
                      <p className="mt-1 text-xs text-stone-400">System type</p>
                    ) : null}
                  </td>
                  <td className="px-4 py-3">
                    <label className="inline-flex items-center gap-2 text-stone-700">
                      <input
                        type="checkbox"
                        checked={type.canBeParentAgreement}
                        disabled={isPending}
                        onChange={() =>
                          handleToggle(type, "canBeParentAgreement")
                        }
                        className="h-4 w-4 rounded border-stone-300 text-stone-900"
                      />
                      Can be parent
                    </label>
                  </td>
                  <td className="px-4 py-3">
                    <label className="inline-flex items-center gap-2 text-stone-700">
                      <input
                        type="checkbox"
                        checked={type.requiresParentAgreement}
                        disabled={isPending}
                        onChange={() =>
                          handleToggle(type, "requiresParentAgreement")
                        }
                        className="h-4 w-4 rounded border-stone-300 text-stone-900"
                      />
                      Requires parent
                    </label>
                  </td>
                  <td className="px-4 py-3 text-stone-600">
                    {type.isActive ? "Active" : "Inactive"}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      disabled={isPending}
                      onClick={() => handleDelete(type)}
                      className="text-sm font-medium text-red-700 hover:text-red-800 disabled:opacity-60"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {message ? (
        <p className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {message}
        </p>
      ) : null}
      {error ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </p>
      ) : null}
    </div>
  );
}
