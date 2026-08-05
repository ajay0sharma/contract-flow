"use client";

import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import { useDeferredEffect } from "@/lib/use-deferred-effect";
import type {
  ContractTemplateRecord,
  ContractTypeRecord,
} from "@/types/contract-template";

interface IntakeConfigurationResponse {
  organizationId: string;
  contractTypes: ContractTypeRecord[];
  templates: ContractTemplateRecord[];
}

interface EditableTypeState {
  id: string;
  slug: string;
  label: string;
  description: string | null;
  showInIntake: boolean;
  displayOrder: number;
  isActive: boolean;
}

function moveItem<T>(items: T[], fromIndex: number, toIndex: number): T[] {
  if (toIndex < 0 || toIndex >= items.length || fromIndex === toIndex) {
    return items;
  }

  const next = [...items];
  const [item] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, item);
  return next;
}

export function IntakeSettingsClient() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [types, setTypes] = useState<EditableTypeState[]>([]);
  const [templates, setTemplates] = useState<ContractTemplateRecord[]>([]);
  const [expandedTypeId, setExpandedTypeId] = useState<string | null>(null);
  const [newTypeLabel, setNewTypeLabel] = useState("");
  const [creatingType, setCreatingType] = useState(false);

  const loadConfiguration = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/legal/intake-config", {
        cache: "no-store",
      });

      if (!response.ok) {
        throw new Error("Failed to load intake configuration.");
      }

      const data = (await response.json()) as IntakeConfigurationResponse;
      setTypes(
        data.contractTypes.map((type) => ({
          id: type.id,
          slug: type.slug,
          label: type.label,
          description: type.description,
          showInIntake: type.showInIntake,
          displayOrder: type.displayOrder,
          isActive: type.isActive,
        })),
      );
      setTemplates(data.templates);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Failed to load intake configuration.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useDeferredEffect(() => {
    void loadConfiguration();
  }, [loadConfiguration]);

  const sortedTypes = useMemo(
    () => [...types].sort((left, right) => left.displayOrder - right.displayOrder),
    [types],
  );

  const templatesByType = useMemo(() => {
    const grouped = new Map<string, ContractTemplateRecord[]>();

    for (const type of sortedTypes) {
      grouped.set(type.slug, []);
    }

    for (const template of templates) {
      const existing = grouped.get(template.contractType) ?? [];
      existing.push(template);
      grouped.set(template.contractType, existing);
    }

    for (const [slug, list] of grouped.entries()) {
      grouped.set(
        slug,
        [...list].sort((left, right) => left.title.localeCompare(right.title)),
      );
    }

    return grouped;
  }, [sortedTypes, templates]);

  function toggleTypeVisibility(typeId: string): void {
    setTypes((current) =>
      current.map((type) =>
        type.id === typeId
          ? { ...type, showInIntake: !type.showInIntake }
          : type,
      ),
    );
    setSuccessMessage(null);
  }

  function moveType(typeId: string, direction: "up" | "down"): void {
    setTypes((current) => {
      const ordered = [...current].sort(
        (left, right) => left.displayOrder - right.displayOrder,
      );
      const index = ordered.findIndex((type) => type.id === typeId);

      if (index === -1) {
        return current;
      }

      const targetIndex = direction === "up" ? index - 1 : index + 1;
      const reordered = moveItem(ordered, index, targetIndex);

      return reordered.map((type, orderIndex) => ({
        ...type,
        displayOrder: orderIndex,
      }));
    });
    setSuccessMessage(null);
  }

  function toggleTemplateVisibility(templateId: string): void {
    setTemplates((current) =>
      current.map((template) =>
        template.id === templateId
          ? { ...template, showInIntake: !template.showInIntake }
          : template,
      ),
    );
    setSuccessMessage(null);
  }

  async function handleCreateType(): Promise<void> {
    const label = newTypeLabel.trim();

    if (!label) {
      setError("Enter a name for the new contract type.");
      return;
    }

    setCreatingType(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const response = await fetch("/api/contract-types", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label }),
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(data?.error ?? "Failed to create contract type.");
      }

      setNewTypeLabel("");
      await loadConfiguration();
      setSuccessMessage(`Added "${label}" to your contract types.`);
    } catch (createError) {
      setError(
        createError instanceof Error
          ? createError.message
          : "Failed to create contract type.",
      );
    } finally {
      setCreatingType(false);
    }
  }

  async function handleSave(): Promise<void> {
    setSaving(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const response = await fetch("/api/legal/intake-config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contractTypes: sortedTypes.map((type, index) => ({
            id: type.id,
            showInIntake: type.showInIntake,
            displayOrder: index,
          })),
          templates: templates.map((template) => ({
            id: template.id,
            showInIntake: template.showInIntake,
          })),
        }),
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(data?.error ?? "Failed to save intake configuration.");
      }

      const data = (await response.json()) as IntakeConfigurationResponse;
      setTypes(
        data.contractTypes.map((type) => ({
          id: type.id,
          slug: type.slug,
          label: type.label,
          description: type.description,
          showInIntake: type.showInIntake,
          displayOrder: type.displayOrder,
          isActive: type.isActive,
        })),
      );
      setTemplates(data.templates);
      setSuccessMessage("Intake form settings saved.");
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Failed to save intake configuration.",
      );
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="animate-pulse space-y-4">
        <div className="h-24 rounded-2xl bg-gray-100" />
        <div className="h-48 rounded-2xl bg-gray-100" />
        <div className="h-48 rounded-2xl bg-gray-100" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-gray-900">
          Contract intake form
        </h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-gray-600">
          Choose which contract types appear in step 1 of the new request form,
          and which templates requesters can pick for each type. Upload new
          templates from{" "}
          <Link
            href="/settings/templates"
            className="font-medium text-[#3558A0] hover:underline"
          >
            Contract templates
          </Link>
          .
        </p>
      </section>

      {error ? (
        <div className="rounded-xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      ) : null}

      {successMessage ? (
        <div className="rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {successMessage}
        </div>
      ) : null}

      <section className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h3 className="text-base font-semibold text-gray-900">
              Contract types
            </h3>
            <p className="mt-1 text-sm text-gray-500">
              Types shown in step 1 and the order they appear.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={saving}
            className="rounded-lg bg-[#3558A0] px-4 py-2 text-sm font-medium text-white hover:bg-[#2d4a85] disabled:opacity-60"
          >
            {saving ? "Saving..." : "Save changes"}
          </button>
        </div>

        <div className="mt-6 space-y-3">
          {sortedTypes.map((type, index) => {
            const typeTemplates = templatesByType.get(type.slug) ?? [];
            const isExpanded = expandedTypeId === type.id;
            const visibleTemplateCount = typeTemplates.filter(
              (template) => template.isActive && template.showInIntake,
            ).length;

            return (
              <div
                key={type.id}
                className="rounded-xl border border-gray-200 bg-gray-50/60"
              >
                <div className="flex flex-wrap items-center gap-3 px-4 py-3">
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      aria-label={`Move ${type.label} up`}
                      disabled={index === 0}
                      onClick={() => moveType(type.id, "up")}
                      className="rounded-md border border-gray-200 px-2 py-1 text-xs text-gray-600 hover:bg-white disabled:opacity-40"
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      aria-label={`Move ${type.label} down`}
                      disabled={index === sortedTypes.length - 1}
                      onClick={() => moveType(type.id, "down")}
                      className="rounded-md border border-gray-200 px-2 py-1 text-xs text-gray-600 hover:bg-white disabled:opacity-40"
                    >
                      ↓
                    </button>
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-gray-900">
                      {type.label}
                    </p>
                    {type.description ? (
                      <p className="mt-0.5 text-xs text-gray-500">
                        {type.description}
                      </p>
                    ) : null}
                  </div>

                  <label className="flex items-center gap-2 text-sm text-gray-700">
                    <input
                      type="checkbox"
                      checked={type.showInIntake}
                      onChange={() => toggleTypeVisibility(type.id)}
                      className="h-4 w-4 rounded border-gray-300 text-[#3558A0]"
                    />
                    Show in intake
                  </label>

                  <button
                    type="button"
                    onClick={() =>
                      setExpandedTypeId(isExpanded ? null : type.id)
                    }
                    className="rounded-md border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-white"
                  >
                    {isExpanded ? "Hide templates" : "Manage templates"}
                    {typeTemplates.length > 0
                      ? ` (${visibleTemplateCount}/${typeTemplates.length})`
                      : ""}
                  </button>
                </div>

                {isExpanded ? (
                  <div className="border-t border-gray-200 bg-white px-4 py-4">
                    {typeTemplates.length === 0 ? (
                      <p className="text-sm text-gray-500">
                        No templates uploaded for this type yet.{" "}
                        <Link
                          href="/settings/templates"
                          className="font-medium text-[#3558A0] hover:underline"
                        >
                          Add a template
                        </Link>
                        .
                      </p>
                    ) : (
                      <ul className="space-y-2">
                        {typeTemplates.map((template) => (
                          <li
                            key={template.id}
                            className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-gray-100 px-3 py-2"
                          >
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-gray-900">
                                {template.title}
                              </p>
                              <p className="text-xs text-gray-500">
                                v{template.version}
                                {!template.isActive ? " · Inactive" : ""}
                                {template.isDefault ? " · Default" : ""}
                              </p>
                            </div>
                            <label className="flex items-center gap-2 text-sm text-gray-700">
                              <input
                                type="checkbox"
                                checked={template.showInIntake}
                                disabled={!template.isActive}
                                onChange={() =>
                                  toggleTemplateVisibility(template.id)
                                }
                                className="h-4 w-4 rounded border-gray-300 text-[#3558A0] disabled:opacity-50"
                              />
                              Show in intake
                            </label>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>

        <div className="mt-6 flex flex-wrap items-end gap-3 border-t border-gray-100 pt-6">
          <div className="min-w-[14rem] flex-1">
            <label
              htmlFor="new-contract-type"
              className="block text-sm font-medium text-gray-700"
            >
              Add contract type
            </label>
            <input
              id="new-contract-type"
              type="text"
              value={newTypeLabel}
              onChange={(event) => setNewTypeLabel(event.target.value)}
              placeholder="e.g. Master lease"
              className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
            />
          </div>
          <button
            type="button"
            onClick={() => void handleCreateType()}
            disabled={creatingType}
            className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60"
          >
            {creatingType ? "Adding..." : "Add type"}
          </button>
        </div>
      </section>
    </div>
  );
}
