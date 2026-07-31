"use client";

import { useEffect, useState } from "react";
import {
  buildPlaceholderWarning,
  extractDocxPlaceholders,
  NO_PLACEHOLDER_WARNING,
} from "@/lib/contract-template-docx";
import {
  validateTemplateFileSize,
} from "@/lib/supabase-storage";
import {
  DOWNLOAD_LINK_ERROR_MESSAGE,
  TEMPLATE_VARIABLE_FIELD_LABELS,
  TEMPLATE_VARIABLE_FIELD_TYPES,
  type ContractTemplateRecord,
  type ContractTemplateType,
  type ContractTypeRecord,
  type TemplateVariableFieldType,
  type TemplateVariableInput,
} from "@/types/contract-template";
import { ContractTypeSelect } from "@/components/templates/ContractTypeSelect";
import { TemplateAuditTrail } from "@/components/templates/TemplateAuditTrail";
import { TemplateVersionHistory } from "@/components/templates/TemplateVersionHistory";
import { openTemplateDocument } from "@/lib/template-file-access";
import {
  inputClassName,
  selectClassName,
  textareaClassName,
} from "@/components/ui/FormField";

export interface TemplateEditorValues {
  title: string;
  contractType: ContractTemplateType;
  description: string;
  variables: TemplateVariableInput[];
  isActive: boolean;
  isDefault: boolean;
  file: File | null;
  changeNote: string;
}

interface TemplateEditorProps {
  open: boolean;
  mode: "create" | "edit";
  initialTemplate?: ContractTemplateRecord | null;
  organizationId: string;
  initialContractTypes?: ContractTypeRecord[];
  isSaving: boolean;
  error: string | null;
  isLegalUser?: boolean;
  uploadSuccess?: {
    title: string;
    placeholderWarning?: string | null;
  } | null;
  onContractTypesChange?: (contractTypes: ContractTypeRecord[]) => void;
  onClose: () => void;
  onSave: (values: TemplateEditorValues) => void;
}

const emptyValues: TemplateEditorValues = {
  title: "",
  contractType: "nda",
  description: "",
  variables: [
    {
      name: "COUNTERPARTY_NAME",
      label: "Counterparty name",
      fieldType: "text",
      isRequired: true,
      defaultValue: "",
      displayOrder: 0,
    },
    {
      name: "EFFECTIVE_DATE",
      label: "Effective date",
      fieldType: "date",
      isRequired: true,
      defaultValue: "",
      displayOrder: 1,
    },
  ],
  isActive: true,
  isDefault: false,
  file: null,
  changeNote: "",
};

function valuesFromTemplate(template: ContractTemplateRecord): TemplateEditorValues {
  return {
    title: template.title,
    contractType: template.contractType,
    description: template.description ?? "",
    variables: template.variables.map((variable) => ({
      name: variable.name,
      label: variable.label,
      fieldType: variable.fieldType,
      isRequired: variable.isRequired,
      defaultValue: variable.defaultValue,
      selectOptions: variable.selectOptions,
      helpText: variable.helpText,
      displayOrder: variable.displayOrder,
    })),
    isActive: template.isActive,
    isDefault: template.isDefault,
    file: null,
    changeNote: "",
  };
}

function emptyVariable(displayOrder: number): TemplateVariableInput {
  return {
    name: "",
    label: "",
    fieldType: "text",
    isRequired: true,
    defaultValue: "",
    displayOrder,
  };
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function TemplateEditor({
  open,
  mode,
  initialTemplate,
  organizationId,
  initialContractTypes = [],
  isSaving,
  error,
  isLegalUser = true,
  uploadSuccess = null,
  onContractTypesChange,
  onClose,
  onSave,
}: TemplateEditorProps) {
  const [values, setValues] = useState<TemplateEditorValues>(emptyValues);
  const [draftVariable, setDraftVariable] = useState<TemplateVariableInput | null>(
    null,
  );
  const [editingVariableIndex, setEditingVariableIndex] = useState<number | null>(
    null,
  );
  const [placeholderWarning, setPlaceholderWarning] = useState<string | null>(
    null,
  );
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [openingFile, setOpeningFile] = useState(false);
  const [historyRefreshKey, setHistoryRefreshKey] = useState(0);

  const fileChanged =
    mode === "edit" && values.file !== null;

  useEffect(() => {
    if (!open) {
      return;
    }

    if (mode === "edit" && initialTemplate) {
      setValues(valuesFromTemplate(initialTemplate));
    } else {
      setValues(emptyValues);
    }

    setDraftVariable(null);
    setEditingVariableIndex(null);
    setPlaceholderWarning(null);
    setDownloadError(null);
    setFileError(null);
  }, [open, mode, initialTemplate]);

  useEffect(() => {
    if (mode === "edit" && initialTemplate) {
      setHistoryRefreshKey((current) => current + 1);
    }
  }, [initialTemplate?.id, initialTemplate?.version, initialTemplate?.updatedAt, initialTemplate, mode]);

  if (!open) {
    return null;
  }

  function resetFromTemplate(): void {
    if (mode === "edit" && initialTemplate) {
      setValues(valuesFromTemplate(initialTemplate));
    } else {
      setValues(emptyValues);
    }

    setDraftVariable(null);
    setEditingVariableIndex(null);
  }

  function handleClose(): void {
    resetFromTemplate();
    onClose();
  }

  function removeVariable(index: number): void {
    if (editingVariableIndex === index) {
      cancelVariableDraft();
    }

    setValues((current) => ({
      ...current,
      variables: current.variables
        .filter((_, variableIndex) => variableIndex !== index)
        .map((variable, variableIndex) => ({
          ...variable,
          displayOrder: variableIndex,
        })),
    }));
  }

  function startEditVariable(index: number): void {
    const variable = values.variables[index];

    if (!variable) {
      return;
    }

    setDraftVariable({ ...variable });
    setEditingVariableIndex(index);
  }

  function cancelVariableDraft(): void {
    setDraftVariable(null);
    setEditingVariableIndex(null);
  }

  function addVariable(): void {
    if (!draftVariable) {
      setDraftVariable(emptyVariable(values.variables.length));
      setEditingVariableIndex(null);
      return;
    }

    const name = draftVariable.name.trim().toUpperCase();
    const label = draftVariable.label.trim();

    if (!name || !label) {
      return;
    }

    const nextVariable: TemplateVariableInput = {
      ...draftVariable,
      name,
      label,
      defaultValue: draftVariable.defaultValue?.trim() || null,
      selectOptions:
        draftVariable.fieldType === "select"
          ? (draftVariable.selectOptions ?? []).filter(Boolean)
          : undefined,
      displayOrder:
        editingVariableIndex ?? values.variables.length,
    };

    setValues((current) => {
      const variables =
        editingVariableIndex === null
          ? [...current.variables, nextVariable]
          : current.variables.map((variable, index) =>
              index === editingVariableIndex ? nextVariable : variable,
            );

      return {
        ...current,
        variables: variables.map((variable, index) => ({
          ...variable,
          displayOrder: index,
        })),
      };
    });
    cancelVariableDraft();
  }

  async function handleFileSelected(file: File | null): Promise<void> {
    setFileError(null);
    setPlaceholderWarning(null);

    if (!file) {
      setValues((current) => ({ ...current, file: null }));
      return;
    }

    const sizeError = validateTemplateFileSize(file.size);

    if (sizeError) {
      setFileError(sizeError);
      setValues((current) => ({ ...current, file: null }));
      return;
    }

    try {
      const placeholders = await extractDocxPlaceholders(await file.arrayBuffer());
      setPlaceholderWarning(buildPlaceholderWarning(placeholders));
      setValues((current) => ({ ...current, file }));
    } catch {
      setFileError("Unable to read the selected Word document.");
      setValues((current) => ({ ...current, file: null }));
    }
  }

  async function handleOpenCurrent(intent: "open" | "download"): Promise<void> {
    if (!initialTemplate) {
      return;
    }

    setOpeningFile(true);
    setDownloadError(null);

    try {
      await openTemplateDocument(
        initialTemplate.id,
        initialTemplate.version,
        intent,
      );
      if (intent === "open") {
        setHistoryRefreshKey((current) => current + 1);
      }
    } catch (openError) {
      setDownloadError(
        openError instanceof Error
          ? openError.message
          : DOWNLOAD_LINK_ERROR_MESSAGE,
      );
    } finally {
      setOpeningFile(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-white">
      <header className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">
            {mode === "create" ? "New contract template" : "Edit contract template"}
          </h2>
          {mode === "edit" && initialTemplate && isLegalUser ? (
            <p className="mt-1 text-sm text-slate-600">
              Version {initialTemplate.version}
              {fileChanged ? " · Replacing the file will create a new version" : ""}
            </p>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleClose}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Close
          </button>
          {isLegalUser && !uploadSuccess ? (
            <button
              type="button"
              disabled={isSaving}
              onClick={() => onSave(values)}
              className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
            >
              {isSaving
                ? "Saving..."
                : mode === "create"
                  ? "Create template"
                  : fileChanged
                    ? "Save new version"
                    : "Save changes"}
            </button>
          ) : null}
        </div>
      </header>

      {uploadSuccess ? (
        <div className="flex flex-1 flex-col items-center justify-center px-6 py-10 text-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-green-50">
            <span className="text-3xl text-green-500" aria-hidden="true">
              ✓
            </span>
          </div>
          <h3 className="text-base font-semibold text-gray-900">
            Template uploaded
          </h3>
          <p className="mt-1 text-sm text-gray-500">
            &ldquo;{uploadSuccess.title}&rdquo; has been added to your library
          </p>
          {uploadSuccess.placeholderWarning ? (
            <div className="mt-4 max-w-sm rounded-xl border border-amber-100 bg-amber-50 p-3 text-left text-xs text-amber-700">
              {uploadSuccess.placeholderWarning}
            </div>
          ) : null}
        </div>
      ) : (
      <div className="grid flex-1 overflow-hidden lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="overflow-y-auto px-6 py-5">
          <div className="mb-5 grid gap-4 md:grid-cols-[2fr_1fr]">
            <label className="block text-sm">
              <span className="mb-2 block font-medium text-slate-700">Title</span>
              <input
                type="text"
                value={values.title}
                onChange={(event) =>
                  setValues((current) => ({
                    ...current,
                    title: event.target.value,
                  }))
                }
                className={inputClassName}
              />
            </label>

            <div className="block text-sm">
              <span className="mb-2 block font-medium text-slate-700">Type</span>
              <ContractTypeSelect
                value={values.contractType}
                onChange={(contractType) =>
                  setValues((current) => ({
                    ...current,
                    contractType,
                  }))
                }
                organizationId={organizationId}
                isLegalUser={isLegalUser}
                initialContractTypes={initialContractTypes}
                onContractTypesChange={onContractTypesChange}
              />
            </div>
          </div>

          <label className="mb-5 block text-sm">
            <span className="mb-2 block font-medium text-slate-700">
              Description
            </span>
            <textarea
              rows={2}
              value={values.description}
              onChange={(event) =>
                setValues((current) => ({
                  ...current,
                  description: event.target.value,
                }))
              }
              className={textareaClassName}
              placeholder="Shown to users when selecting this template"
            />
          </label>

          <div className="mb-5 rounded-md border border-slate-200 bg-slate-50 p-4">
            {mode === "edit" && initialTemplate && isLegalUser ? (
              <div className="mb-4 rounded-lg border border-indigo-100 bg-indigo-50/60 p-4">
                <p className="text-sm font-semibold text-indigo-950">
                  Edit in Word and save a new version
                </p>
                <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-indigo-900/80">
                  <li>Open the current template in Microsoft Word.</li>
                  <li>Make your edits and save the file on your computer.</li>
                  <li>Upload the updated file below to archive the prior version.</li>
                </ol>
                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={openingFile}
                    onClick={() => void handleOpenCurrent("open")}
                    className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
                  >
                    {openingFile ? "Opening..." : "Open in Word"}
                  </button>
                  <button
                    type="button"
                    disabled={openingFile}
                    onClick={() => void handleOpenCurrent("download")}
                    className="rounded-md border border-indigo-200 bg-white px-4 py-2 text-sm font-medium text-indigo-800 hover:bg-indigo-100 disabled:opacity-60"
                  >
                    Download current
                  </button>
                </div>
              </div>
            ) : null}

            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-slate-700">
                  {mode === "edit" ? "Upload new version" : "Word document"}
                </p>
                {mode === "edit" && initialTemplate ? (
                  <p className="mt-1 text-sm text-slate-600">
                    Current file: {initialTemplate.fileName} (
                    {formatFileSize(initialTemplate.fileSize)}) · v
                    {initialTemplate.version}
                  </p>
                ) : (
                  <p className="mt-1 text-sm text-slate-600">
                    Upload a .docx template file.
                  </p>
                )}
                {values.file ? (
                  <p className="mt-2 text-sm text-indigo-700">
                    New file selected: {values.file.name} (
                    {formatFileSize(values.file.size)})
                  </p>
                ) : null}
              </div>
            </div>

            {isLegalUser ? (
              <input
                type="file"
                accept=".doc,.docx,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                onChange={(event) => {
                  void handleFileSelected(event.target.files?.[0] ?? null);
                }}
                className="mt-4 block w-full text-sm text-slate-700"
              />
            ) : null}
            <p className="mt-2 text-xs text-slate-500">
              {mode === "edit"
                ? "Uploading a new file creates the next version and archives the current one."
                : "Template documents must be under 25MB."}
            </p>

            {fileError ? (
              <div className="mt-3 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-900">
                {fileError}
              </div>
            ) : null}

            {placeholderWarning ? (
              <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                {NO_PLACEHOLDER_WARNING}
              </div>
            ) : null}

            {downloadError ? (
              <div className="mt-3 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-900">
                {downloadError}
              </div>
            ) : null}

            {mode === "edit" && fileChanged && isLegalUser ? (
              <label className="mt-4 block text-sm">
                <span className="mb-2 block font-medium text-slate-700">
                  Change note (recommended)
                </span>
                <input
                  type="text"
                  value={values.changeNote}
                  onChange={(event) =>
                    setValues((current) => ({
                      ...current,
                      changeNote: event.target.value,
                    }))
                  }
                  placeholder="Describe what changed in this version"
                  className={inputClassName}
                />
              </label>
            ) : null}
          </div>

          {mode === "edit" && initialTemplate && isLegalUser ? (
            <div className="mb-5 space-y-4">
              <TemplateVersionHistory
                templateId={initialTemplate.id}
                refreshKey={historyRefreshKey}
              />
              <TemplateAuditTrail
                templateId={initialTemplate.id}
                refreshKey={historyRefreshKey}
              />
            </div>
          ) : null}

          {isLegalUser ? (
            <div className="flex flex-wrap gap-6">
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={values.isActive}
                  onChange={(event) =>
                    setValues((current) => ({
                      ...current,
                      isActive: event.target.checked,
                    }))
                  }
                  className="h-4 w-4 rounded border-slate-300 text-indigo-600"
                />
                Active (visible to general users)
              </label>

              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={values.isDefault}
                  onChange={(event) =>
                    setValues((current) => ({
                      ...current,
                      isDefault: event.target.checked,
                    }))
                  }
                  className="h-4 w-4 rounded border-slate-300 text-indigo-600"
                />
                Default for this contract type
              </label>
            </div>
          ) : null}

          {error ? (
            <div className="mt-4 rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
              {error}
            </div>
          ) : null}
        </div>

        <aside className="overflow-y-auto border-l border-slate-200 bg-slate-50 px-4 py-5">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-slate-900">Variables</h3>
            {isLegalUser ? (
              <button
                type="button"
                onClick={() => {
                  setEditingVariableIndex(null);
                  setDraftVariable(emptyVariable(values.variables.length));
                }}
                className="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100"
              >
                Add variable
              </button>
            ) : null}
          </div>

          <p className="mt-2 text-xs text-slate-500">
            Define placeholders that general users fill in before generating a contract.
          </p>

          <div className="mt-4 space-y-3">
            {values.variables.map((variable, index) => (
              <div
                key={`${variable.name}-${index}`}
                className="rounded-md border border-slate-200 bg-white p-3"
              >
                <div>
                  <p className="font-mono text-xs font-semibold text-indigo-700">
                    {variable.name}
                  </p>
                  <p className="mt-1 text-sm font-medium text-slate-900">
                    {variable.label}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    {TEMPLATE_VARIABLE_FIELD_LABELS[variable.fieldType]}
                    {variable.isRequired ? " · required" : ""}
                  </p>
                </div>
                {isLegalUser ? (
                  <div className="mt-3 flex gap-3">
                    <button
                      type="button"
                      onClick={() => startEditVariable(index)}
                      className="text-xs font-medium text-indigo-700 hover:text-indigo-900"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => removeVariable(index)}
                      className="text-xs font-medium text-rose-700 hover:text-rose-900"
                    >
                      Remove
                    </button>
                  </div>
                ) : null}
              </div>
            ))}
          </div>

          {isLegalUser && draftVariable ? (
            <div className="mt-4 space-y-3 rounded-md border border-dashed border-slate-300 bg-white p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                {editingVariableIndex === null ? "New variable" : "Edit variable"}
              </p>
              <input
                type="text"
                placeholder="Variable name (e.g. COUNTERPARTY_NAME)"
                value={draftVariable.name}
                onChange={(event) =>
                  setDraftVariable((current) =>
                    current
                      ? { ...current, name: event.target.value.toUpperCase() }
                      : current,
                  )
                }
                className={inputClassName}
              />
              <input
                type="text"
                placeholder="Label"
                value={draftVariable.label}
                onChange={(event) =>
                  setDraftVariable((current) =>
                    current ? { ...current, label: event.target.value } : current,
                  )
                }
                className={inputClassName}
              />
              <select
                value={draftVariable.fieldType}
                onChange={(event) =>
                  setDraftVariable((current) =>
                    current
                      ? {
                          ...current,
                          fieldType: event.target.value as TemplateVariableFieldType,
                        }
                      : current,
                  )
                }
                className={selectClassName}
              >
                {TEMPLATE_VARIABLE_FIELD_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {TEMPLATE_VARIABLE_FIELD_LABELS[type]}
                  </option>
                ))}
              </select>
              <input
                type="text"
                placeholder="Default value (optional)"
                value={draftVariable.defaultValue ?? ""}
                onChange={(event) =>
                  setDraftVariable((current) =>
                    current
                      ? { ...current, defaultValue: event.target.value }
                      : current,
                  )
                }
                className={inputClassName}
              />
              <input
                type="text"
                placeholder="Help text (optional)"
                value={draftVariable.helpText ?? ""}
                onChange={(event) =>
                  setDraftVariable((current) =>
                    current
                      ? { ...current, helpText: event.target.value }
                      : current,
                  )
                }
                className={inputClassName}
              />
              {draftVariable.fieldType === "select" ? (
                <input
                  type="text"
                  placeholder="Select options (comma separated)"
                  value={(draftVariable.selectOptions ?? []).join(", ")}
                  onChange={(event) =>
                    setDraftVariable((current) =>
                      current
                        ? {
                            ...current,
                            selectOptions: event.target.value
                              .split(",")
                              .map((option) => option.trim())
                              .filter(Boolean),
                          }
                        : current,
                    )
                  }
                  className={inputClassName}
                />
              ) : null}
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={draftVariable.isRequired ?? true}
                  onChange={(event) =>
                    setDraftVariable((current) =>
                      current
                        ? { ...current, isRequired: event.target.checked }
                        : current,
                    )
                  }
                  className="h-4 w-4 rounded border-slate-300 text-indigo-600"
                />
                Required
              </label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={addVariable}
                  className="rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700"
                >
                  {editingVariableIndex === null
                    ? "Save variable"
                    : "Update variable"}
                </button>
                <button
                  type="button"
                  onClick={cancelVariableDraft}
                  className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : null}
        </aside>
      </div>
      )}
    </div>
  );
}
