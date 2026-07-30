"use client";

import { useMemo, useState, useTransition } from "react";
import {
  inputClassName,
  selectClassName,
  textareaClassName,
} from "@/components/ui/FormField";
import { makeUniqueIntakeKey } from "@/lib/intake-form-catalog";
import type {
  IntakeFormDefinitionRecord,
  IntakeFormFieldRecord,
  IntakeFormSectionRecord,
} from "@/types/intake-form";
import type { TemplateVariableFieldType } from "@/types/contract-template";

const FIELD_TYPE_OPTIONS: Array<{
  value: TemplateVariableFieldType;
  label: string;
}> = [
  { value: "text", label: "Text" },
  { value: "date", label: "Date" },
  { value: "number", label: "Number" },
  { value: "currency", label: "Currency" },
  { value: "email", label: "Email" },
  { value: "select", label: "Select" },
  { value: "yes_no", label: "Yes / No" },
];

interface IntakeFormAdminFormProps {
  initialForm: IntakeFormDefinitionRecord;
}

async function readJsonResponse<T>(response: Response): Promise<T> {
  const text = await response.text();

  if (!text.trim()) {
    throw new Error("Empty response from server.");
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(
      text.startsWith("<")
        ? "Unexpected HTML response from server. Try refreshing and signing in again."
        : "Unexpected response from server.",
    );
  }
}

function cloneForm(form: IntakeFormDefinitionRecord): IntakeFormDefinitionRecord {
  return JSON.parse(JSON.stringify(form)) as IntakeFormDefinitionRecord;
}

function sortSections(form: IntakeFormDefinitionRecord): IntakeFormSectionRecord[] {
  return [...form.sections].sort(
    (left, right) => left.displayOrder - right.displayOrder,
  );
}

function sortFields(section: IntakeFormSectionRecord): IntakeFormFieldRecord[] {
  return [...section.fields].sort(
    (left, right) => left.displayOrder - right.displayOrder,
  );
}

export function IntakeFormAdminForm({ initialForm }: IntakeFormAdminFormProps) {
  const [form, setForm] = useState(() => cloneForm(initialForm));
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const sections = useMemo(() => sortSections(form), [form]);

  function updateSection(
    sectionId: string,
    updates: Partial<IntakeFormSectionRecord>,
  ): void {
    setForm((current) => ({
      ...current,
      sections: current.sections.map((section) =>
        section.id === sectionId ? { ...section, ...updates } : section,
      ),
    }));
  }

  function updateField(
    sectionId: string,
    fieldId: string,
    updates: Partial<IntakeFormFieldRecord>,
  ): void {
    setForm((current) => ({
      ...current,
      sections: current.sections.map((section) =>
        section.id === sectionId
          ? {
              ...section,
              fields: section.fields.map((field) =>
                field.id === fieldId ? { ...field, ...updates } : field,
              ),
            }
          : section,
      ),
    }));
  }

  function removeSection(sectionId: string): void {
    setForm((current) => ({
      ...current,
      sections: current.sections.filter((section) => section.id !== sectionId),
    }));
  }

  function removeField(sectionId: string, fieldId: string): void {
    setForm((current) => ({
      ...current,
      sections: current.sections.map((section) =>
        section.id === sectionId
          ? {
              ...section,
              fields: section.fields.filter((field) => field.id !== fieldId),
            }
          : section,
      ),
    }));
  }

  function moveSection(sectionId: string, direction: -1 | 1): void {
    setForm((current) => {
      const ordered = sortSections(current);
      const index = ordered.findIndex((section) => section.id === sectionId);

      if (index < 0) {
        return current;
      }

      const targetIndex = index + direction;

      if (targetIndex < 0 || targetIndex >= ordered.length) {
        return current;
      }

      const reordered = [...ordered];
      const [moved] = reordered.splice(index, 1);
      reordered.splice(targetIndex, 0, moved);

      return {
        ...current,
        sections: reordered.map((section, displayOrder) => ({
          ...section,
          displayOrder,
        })),
      };
    });
  }

  function moveField(
    sectionId: string,
    fieldId: string,
    direction: -1 | 1,
  ): void {
    setForm((current) => ({
      ...current,
      sections: current.sections.map((section) => {
        if (section.id !== sectionId) {
          return section;
        }

        const ordered = sortFields(section);
        const index = ordered.findIndex((field) => field.id === fieldId);

        if (index < 0) {
          return section;
        }

        const targetIndex = index + direction;

        if (targetIndex < 0 || targetIndex >= ordered.length) {
          return section;
        }

        const reordered = [...ordered];
        const [moved] = reordered.splice(index, 1);
        reordered.splice(targetIndex, 0, moved);

        return {
          ...section,
          fields: reordered.map((field, displayOrder) => ({
            ...field,
            displayOrder,
          })),
        };
      }),
    }));
  }

  function addSection(): void {
    const existingKeys = form.sections.map((section) => section.key);
    const label = "Custom section";
    const key = makeUniqueIntakeKey(label, existingKeys);
    const sectionId = `draft-section-${Date.now()}`;

    setForm((current) => ({
      ...current,
      sections: [
        ...current.sections,
        {
          id: sectionId,
          formId: current.id,
          key,
          label,
          description: "",
          displayOrder: current.sections.length,
          isSystem: false,
          fields: [],
          createdAt: current.updatedAt,
          updatedAt: current.updatedAt,
        },
      ],
    }));
  }

  function addField(sectionId: string): void {
    const section = form.sections.find((entry) => entry.id === sectionId);

    if (!section) {
      return;
    }

    const existingKeys = section.fields.map((field) => field.key);
    const label = "Custom field";
    const key = makeUniqueIntakeKey(label, existingKeys);
    const fieldId = `draft-field-${Date.now()}`;

    setForm((current) => ({
      ...current,
      sections: current.sections.map((entry) =>
        entry.id === sectionId
          ? {
              ...entry,
              fields: [
                ...entry.fields,
                {
                  id: fieldId,
                  sectionId,
                  key,
                  label,
                  fieldType: "text",
                  isRequired: false,
                  isSystem: false,
                  displayOrder: entry.fields.length,
                  helpText: null,
                  placeholder: null,
                  selectOptions: [],
                  createdAt: current.updatedAt,
                  updatedAt: current.updatedAt,
                },
              ],
            }
          : entry,
      ),
    }));
  }

  function handleSave(): void {
    setMessage(null);
    setError(null);

    startTransition(async () => {
      try {
        const payload = {
          name: form.name,
          organizationId: form.organizationId,
          sections: sortSections(form).map((section) => ({
            key: section.key,
            label: section.label,
            description: section.description,
            displayOrder: section.displayOrder,
            isSystem: section.isSystem,
            fields: sortFields(section).map((field) => ({
              key: field.key,
              label: field.label,
              fieldType: field.fieldType,
              isRequired: field.isRequired,
              isSystem: field.isSystem,
              displayOrder: field.displayOrder,
              helpText: field.helpText,
              placeholder: field.placeholder,
              selectOptions: field.selectOptions,
            })),
          })),
        };

        const response = await fetch("/api/admin/intake-form", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        const data = await readJsonResponse<{
          intakeForm?: IntakeFormDefinitionRecord;
          error?: string;
        }>(response);

        if (!response.ok || !data.intakeForm) {
          throw new Error(data.error ?? "Unable to save intake form.");
        }

        setForm(cloneForm(data.intakeForm));
        setMessage("Intake form saved.");
      } catch (saveError) {
        setError(
          saveError instanceof Error
            ? saveError.message
            : "Unable to save intake form.",
        );
      }
    });
  }

  function handleReset(): void {
    setMessage(null);
    setError(null);

    startTransition(async () => {
      try {
        const response = await fetch("/api/admin/intake-form", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "reset" }),
        });

        const data = await readJsonResponse<{
          intakeForm?: IntakeFormDefinitionRecord;
          error?: string;
        }>(response);

        if (!response.ok || !data.intakeForm) {
          throw new Error(data.error ?? "Unable to reset intake form.");
        }

        setForm(cloneForm(data.intakeForm));
        setMessage("Intake form reset to defaults.");
      } catch (resetError) {
        setError(
          resetError instanceof Error
            ? resetError.message
            : "Unable to reset intake form.",
        );
      }
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-stone-600">
          Add or remove sections and fields on the contract intake form. System
          fields keep their specialized behavior when left enabled.
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={handleReset}
            disabled={isPending}
            className="rounded-md border border-stone-300 px-3 py-2 text-sm font-medium text-stone-700 hover:bg-stone-50 disabled:opacity-60"
          >
            Reset to defaults
          </button>
          <button
            type="button"
            onClick={addSection}
            disabled={isPending}
            className="rounded-md border border-stone-300 px-3 py-2 text-sm font-medium text-stone-700 hover:bg-stone-50 disabled:opacity-60"
          >
            Add section
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={isPending}
            className="rounded-md bg-stone-900 px-4 py-2 text-sm font-medium text-white hover:bg-stone-800 disabled:opacity-60"
          >
            {isPending ? "Saving..." : "Save intake form"}
          </button>
        </div>
      </div>

      {message ? (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          {message}
        </div>
      ) : null}

      {error ? (
        <div className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
          {error}
        </div>
      ) : null}

      <div className="space-y-5">
        {sections.map((section, sectionIndex) => (
          <div
            key={section.id}
            className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1 space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    type="text"
                    value={section.label}
                    onChange={(event) =>
                      updateSection(section.id, { label: event.target.value })
                    }
                    className={`${inputClassName} max-w-md font-medium`}
                  />
                  {section.isSystem ? (
                    <span className="rounded-full bg-stone-100 px-2 py-0.5 text-xs font-medium text-stone-600">
                      System section
                    </span>
                  ) : (
                    <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700">
                      Custom section
                    </span>
                  )}
                </div>
                <textarea
                  value={section.description ?? ""}
                  onChange={(event) =>
                    updateSection(section.id, {
                      description: event.target.value,
                    })
                  }
                  rows={2}
                  placeholder="Section description shown on the intake form"
                  className={textareaClassName}
                />
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => moveSection(section.id, -1)}
                  disabled={sectionIndex === 0 || isPending}
                  className="rounded-md border border-stone-300 px-2 py-1 text-xs font-medium text-stone-700 hover:bg-stone-50 disabled:opacity-40"
                >
                  Move up
                </button>
                <button
                  type="button"
                  onClick={() => moveSection(section.id, 1)}
                  disabled={sectionIndex === sections.length - 1 || isPending}
                  className="rounded-md border border-stone-300 px-2 py-1 text-xs font-medium text-stone-700 hover:bg-stone-50 disabled:opacity-40"
                >
                  Move down
                </button>
                <button
                  type="button"
                  onClick={() => removeSection(section.id)}
                  disabled={isPending}
                  className="rounded-md border border-rose-200 px-2 py-1 text-xs font-medium text-rose-700 hover:bg-rose-50 disabled:opacity-40"
                >
                  Remove section
                </button>
              </div>
            </div>

            <div className="mt-5 space-y-4">
              {sortFields(section).map((field, fieldIndex) => (
                <div
                  key={field.id}
                  className="rounded-lg border border-stone-100 bg-stone-50 p-4"
                >
                  <div className="grid gap-4 md:grid-cols-2">
                    <label className="block text-sm">
                      <span className="mb-1 block font-medium text-stone-700">
                        Field label
                      </span>
                      <input
                        type="text"
                        value={field.label}
                        onChange={(event) =>
                          updateField(section.id, field.id, {
                            label: event.target.value,
                          })
                        }
                        className={inputClassName}
                      />
                    </label>
                    <label className="block text-sm">
                      <span className="mb-1 block font-medium text-stone-700">
                        Field type
                      </span>
                      <select
                        value={field.fieldType}
                        disabled={field.isSystem}
                        onChange={(event) =>
                          updateField(section.id, field.id, {
                            fieldType: event.target.value as TemplateVariableFieldType,
                          })
                        }
                        className={selectClassName}
                      >
                        {FIELD_TYPE_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="block text-sm md:col-span-2">
                      <span className="mb-1 block font-medium text-stone-700">
                        Help text
                      </span>
                      <input
                        type="text"
                        value={field.helpText ?? ""}
                        onChange={(event) =>
                          updateField(section.id, field.id, {
                            helpText: event.target.value,
                          })
                        }
                        className={inputClassName}
                      />
                    </label>
                    {!field.isSystem ? (
                      <label className="block text-sm md:col-span-2">
                        <span className="mb-1 block font-medium text-stone-700">
                          Placeholder
                        </span>
                        <input
                          type="text"
                          value={field.placeholder ?? ""}
                          onChange={(event) =>
                            updateField(section.id, field.id, {
                              placeholder: event.target.value,
                            })
                          }
                          className={inputClassName}
                        />
                      </label>
                    ) : null}
                    {field.fieldType === "select" && !field.isSystem ? (
                      <label className="block text-sm md:col-span-2">
                        <span className="mb-1 block font-medium text-stone-700">
                          Select options (comma-separated)
                        </span>
                        <input
                          type="text"
                          value={field.selectOptions.join(", ")}
                          onChange={(event) =>
                            updateField(section.id, field.id, {
                              selectOptions: event.target.value
                                .split(",")
                                .map((entry) => entry.trim())
                                .filter(Boolean),
                            })
                          }
                          className={inputClassName}
                        />
                      </label>
                    ) : null}
                  </div>

                  <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                    <label className="flex items-center gap-2 text-sm text-stone-700">
                      <input
                        type="checkbox"
                        checked={field.isRequired}
                        onChange={(event) =>
                          updateField(section.id, field.id, {
                            isRequired: event.target.checked,
                          })
                        }
                        className="h-4 w-4 rounded border-stone-300"
                      />
                      Required
                      {field.isSystem ? (
                        <span className="text-xs text-stone-500">(system field)</span>
                      ) : null}
                    </label>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => moveField(section.id, field.id, -1)}
                        disabled={fieldIndex === 0 || isPending}
                        className="rounded-md border border-stone-300 px-2 py-1 text-xs font-medium text-stone-700 hover:bg-white disabled:opacity-40"
                      >
                        Move up
                      </button>
                      <button
                        type="button"
                        onClick={() => moveField(section.id, field.id, 1)}
                        disabled={
                          fieldIndex === sortFields(section).length - 1 ||
                          isPending
                        }
                        className="rounded-md border border-stone-300 px-2 py-1 text-xs font-medium text-stone-700 hover:bg-white disabled:opacity-40"
                      >
                        Move down
                      </button>
                      <button
                        type="button"
                        onClick={() => removeField(section.id, field.id)}
                        disabled={isPending}
                        className="rounded-md border border-rose-200 px-2 py-1 text-xs font-medium text-rose-700 hover:bg-rose-50 disabled:opacity-40"
                      >
                        Remove field
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <button
              type="button"
              onClick={() => addField(section.id)}
              disabled={isPending}
              className="mt-4 rounded-md border border-dashed border-stone-300 px-3 py-2 text-sm font-medium text-stone-700 hover:bg-stone-50 disabled:opacity-60"
            >
              Add field to section
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
