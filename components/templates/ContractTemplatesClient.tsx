"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useDeferredEffect } from "@/lib/use-deferred-effect";
import { openTemplateDocument } from "@/lib/template-file-access";
import {
  TemplateEditor,
  type TemplateEditorValues,
} from "@/components/templates/TemplateEditor";
import {
  getContractTypeLabel,
  DOWNLOAD_LINK_ERROR_MESSAGE,
  type ContractTemplateRecord,
  type ContractTypeRecord,
} from "@/types/contract-template";

interface ContractTemplatesClientProps {
  initialTemplates: ContractTemplateRecord[];
  initialContractTypes: ContractTypeRecord[];
  organizationId: string;
  isLegalUser: boolean;
}

interface UploadSuccessState {
  title: string;
  placeholderWarning?: string | null;
}

function formatFileSize(bytes: number): string {
  if (!bytes) {
    return "—";
  }

  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${Math.round(bytes / 1024)} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatRelativeTime(dateString: string): string {
  if (!dateString) {
    return "—";
  }

  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) {
    return "just now";
  }

  if (diffMins < 60) {
    return `${diffMins} minute${diffMins === 1 ? "" : "s"} ago`;
  }

  if (diffHours < 24) {
    return `${diffHours} hour${diffHours === 1 ? "" : "s"} ago`;
  }

  if (diffDays === 1) {
    return "yesterday";
  }

  if (diffDays < 30) {
    return `${diffDays} days ago`;
  }

  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function getContractTypeBadgeClass(contractType: string): string {
  const classes: Record<string, string> = {
    vendor: "bg-purple-50 text-purple-700",
    customer: "bg-teal-50 text-teal-700",
    nda: "bg-blue-50 text-blue-700",
    employment: "bg-pink-50 text-pink-700",
    saas: "bg-violet-50 text-violet-700",
    consulting: "bg-orange-50 text-orange-700",
    partnership: "bg-indigo-50 text-indigo-700",
    other: "bg-gray-100 text-gray-600",
  };

  return classes[contractType] ?? "bg-gray-100 text-gray-600";
}

function mergeTemplateLists(
  primary: ContractTemplateRecord[],
  secondary: ContractTemplateRecord[],
): ContractTemplateRecord[] {
  const byId = new Map<string, ContractTemplateRecord>();

  for (const template of secondary) {
    byId.set(template.id, template);
  }

  for (const template of primary) {
    byId.set(template.id, template);
  }

  return [...byId.values()].sort(
    (left, right) =>
      new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime(),
  );
}

function TemplateTableSkeleton() {
  return (
    <div className="animate-pulse overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
      <div className="border-b border-gray-100 bg-gray-50 px-4 py-3">
        <div className="h-4 w-48 rounded bg-gray-100" />
      </div>
      <div className="space-y-3 p-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="h-12 rounded bg-gray-100" />
        ))}
      </div>
    </div>
  );
}

function TemplateListTable({
  templates,
  contractTypes,
  isLegalUser,
  downloadingId,
  openingId,
  deletingId,
  onEdit,
  onDownload,
  onOpen,
  onDelete,
}: {
  templates: ContractTemplateRecord[];
  contractTypes: ContractTypeRecord[];
  isLegalUser: boolean;
  downloadingId: string | null;
  openingId: string | null;
  deletingId: string | null;
  onEdit: (template: ContractTemplateRecord) => void;
  onDownload: (template: ContractTemplateRecord) => void;
  onOpen: (template: ContractTemplateRecord) => void;
  onDelete: (template: ContractTemplateRecord) => void;
}) {
  return (
    <div className="w-full overflow-x-auto rounded-2xl border border-gray-100 bg-white shadow-sm">
      <table className="w-full min-w-0 border-collapse text-sm">
        <thead>
          <tr className="border-b border-gray-100 bg-gray-50/80">
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
              Template
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
              Type
            </th>
            <th className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
              Version
            </th>
            <th className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
              File size
            </th>
            <th className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
              Uploaded
            </th>
            <th className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
              Status
            </th>
            {isLegalUser ? (
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                Actions
              </th>
            ) : null}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {templates.map((template) => (
            <tr
              key={template.id}
              className="transition-colors hover:bg-blue-50/20"
            >
              <td className="px-4 py-3">
                <div className="min-w-0">
                  {isLegalUser ? (
                    <button
                      type="button"
                      onClick={() => onEdit(template)}
                      className="truncate text-left font-medium text-indigo-700 hover:text-indigo-900 hover:underline"
                    >
                      {template.title}
                    </button>
                  ) : (
                    <p className="truncate font-medium text-gray-900">
                      {template.title}
                    </p>
                  )}
                  {template.description ? (
                    <p className="mt-0.5 line-clamp-1 text-xs text-gray-500">
                      {template.description}
                    </p>
                  ) : null}
                </div>
              </td>
              <td className="px-4 py-3">
                <span
                  className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${getContractTypeBadgeClass(template.contractType)}`}
                >
                  {getContractTypeLabel(template.contractType, contractTypes)}
                </span>
              </td>
              <td className="whitespace-nowrap px-4 py-3 text-gray-600">
                v{template.version}
              </td>
              <td className="whitespace-nowrap px-4 py-3 text-gray-600">
                {formatFileSize(template.fileSize)}
              </td>
              <td className="whitespace-nowrap px-4 py-3 text-gray-500">
                {formatRelativeTime(template.uploadedAt)}
              </td>
              <td className="whitespace-nowrap px-4 py-3">
                <div className="flex flex-wrap items-center gap-1.5">
                  {template.isDefault ? (
                    <span className="inline-flex items-center rounded-full bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700">
                      Default
                    </span>
                  ) : null}
                  <span
                    className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                      template.isActive
                        ? "bg-emerald-50 text-emerald-700"
                        : "bg-gray-100 text-gray-500"
                    }`}
                  >
                    {template.isActive ? "Active" : "Inactive"}
                  </span>
                </div>
              </td>
              {isLegalUser ? (
                <td className="px-4 py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => onOpen(template)}
                      disabled={
                        openingId === template.id ||
                        downloadingId === template.id ||
                        deletingId === template.id
                      }
                      className="rounded-lg border border-indigo-200 px-3 py-1.5 text-xs font-medium text-indigo-700 transition-colors hover:bg-indigo-50 disabled:opacity-60"
                    >
                      {openingId === template.id ? "Opening..." : "Open"}
                    </button>
                    <button
                      type="button"
                      onClick={() => onDownload(template)}
                      disabled={
                        downloadingId === template.id ||
                        openingId === template.id ||
                        deletingId === template.id
                      }
                      className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-50 disabled:opacity-60"
                    >
                      {downloadingId === template.id
                        ? "Downloading..."
                        : "Download"}
                    </button>
                    <button
                      type="button"
                      onClick={() => onEdit(template)}
                      disabled={deletingId === template.id}
                      className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-50 disabled:opacity-60"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => onDelete(template)}
                      disabled={
                        deletingId === template.id ||
                        downloadingId === template.id ||
                        !template.isActive
                      }
                      className="rounded-lg border border-rose-200 px-3 py-1.5 text-xs font-medium text-rose-700 transition-colors hover:bg-rose-50 disabled:opacity-60"
                    >
                      {deletingId === template.id ? "Deleting..." : "Delete"}
                    </button>
                  </div>
                </td>
              ) : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ContractTemplatesClient({
  initialTemplates,
  initialContractTypes,
  organizationId,
  isLegalUser,
}: ContractTemplatesClientProps) {
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [templates, setTemplates] = useState(initialTemplates);
  const [contractTypes, setContractTypes] = useState(initialContractTypes);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorMode, setEditorMode] = useState<"create" | "edit">("create");
  const [editingTemplate, setEditingTemplate] =
    useState<ContractTemplateRecord | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState<UploadSuccessState | null>(
    null,
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("active");
  const [deactivationPrompt, setDeactivationPrompt] = useState<{
    values: TemplateEditorValues;
    inProgressCount: number;
    message: string;
  } | null>(null);
  const [deactivationConfirmText, setDeactivationConfirmText] = useState("");
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deletePrompt, setDeletePrompt] =
    useState<ContractTemplateRecord | null>(null);

  useDeferredEffect(() => {
    setTemplates((current) => {
      if (initialTemplates.length === 0) {
        return current;
      }

      return mergeTemplateLists(initialTemplates, current);
    });
  }, [initialTemplates]);

  useEffect(() => {
    return () => {
      if (closeTimerRef.current) {
        clearTimeout(closeTimerRef.current);
      }
    };
  }, []);

  const refreshTemplates = useCallback(async (): Promise<void> => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/templates?organizationId=${encodeURIComponent(organizationId)}`,
      );
      const responseText = await response.text();

      if (!responseText.trim()) {
        throw new Error("Failed to load templates");
      }

      const payload = JSON.parse(responseText) as {
        templates?: ContractTemplateRecord[];
        error?: string;
      };

      if (!response.ok) {
        throw new Error(payload.error ?? "Failed to load templates");
      }

      const fetched = payload.templates ?? [];
      setTemplates((current) => mergeTemplateLists(fetched, current));
    } catch (refreshError) {
      console.error("Failed to refresh templates:", refreshError);
      setError(
        refreshError instanceof Error
          ? refreshError.message
          : "Unable to load templates.",
      );
    } finally {
      setIsLoading(false);
    }
  }, [organizationId]);

  const filteredTemplates = useMemo(() => {
    return templates.filter((template) => {
      if (statusFilter === "active" && !template.isActive) {
        return false;
      }

      if (statusFilter === "inactive" && template.isActive) {
        return false;
      }

      if (typeFilter && template.contractType !== typeFilter) {
        return false;
      }

      if (searchQuery.trim()) {
        const query = searchQuery.trim().toLowerCase();
        return (
          template.title.toLowerCase().includes(query) ||
          template.description?.toLowerCase().includes(query) ||
          template.contractType.toLowerCase().includes(query)
        );
      }

      return true;
    });
  }, [templates, statusFilter, typeFilter, searchQuery]);

  function clearCloseTimer(): void {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }

  function closeEditor(): void {
    clearCloseTimer();
    setEditorOpen(false);
    setEditingTemplate(null);
    setUploadSuccess(null);
    setError(null);
    setDeactivationPrompt(null);
    setDeactivationConfirmText("");
  }

  function scheduleEditorClose(): void {
    clearCloseTimer();
    closeTimerRef.current = setTimeout(() => {
      void (async () => {
        await refreshTemplates();
        closeEditor();
      })();
    }, 1500);
  }

  function openCreateEditor(): void {
    if (!isLegalUser) {
      return;
    }

    clearCloseTimer();
    setUploadSuccess(null);
    setEditorMode("create");
    setEditingTemplate(null);
    setError(null);
    setEditorOpen(true);
  }

  function openEditEditor(template: ContractTemplateRecord): void {
    if (!isLegalUser) {
      return;
    }

    clearCloseTimer();
    setUploadSuccess(null);
    setEditorMode("edit");
    setEditingTemplate(template);
    setError(null);
    setEditorOpen(true);
  }

  async function handleOpen(template: ContractTemplateRecord): Promise<void> {
    if (!isLegalUser) {
      return;
    }

    setOpeningId(template.id);
    setError(null);

    try {
      await openTemplateDocument(template.id, template.version, "open");
    } catch (openError) {
      setError(
        openError instanceof Error
          ? openError.message
          : DOWNLOAD_LINK_ERROR_MESSAGE,
      );
    } finally {
      setOpeningId(null);
    }
  }

  async function handleDownload(template: ContractTemplateRecord): Promise<void> {
    if (!isLegalUser) {
      return;
    }

    setDownloadingId(template.id);
    setError(null);

    try {
      await openTemplateDocument(template.id, template.version, "download");
    } catch (downloadError) {
      setError(
        downloadError instanceof Error
          ? downloadError.message
          : DOWNLOAD_LINK_ERROR_MESSAGE,
      );
    } finally {
      setDownloadingId(null);
    }
  }

  async function handleDelete(template: ContractTemplateRecord): Promise<void> {
    if (!isLegalUser) {
      return;
    }

    setDeletePrompt(template);
  }

  async function confirmDelete(): Promise<void> {
    if (!deletePrompt || !isLegalUser) {
      return;
    }

    setDeletingId(deletePrompt.id);
    setError(null);

    try {
      const response = await fetch(`/api/templates/${deletePrompt.id}`, {
        method: "DELETE",
      });
      const payload = (await response.json()) as {
        template?: ContractTemplateRecord;
        error?: string;
      };

      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to delete template.");
      }

      const updatedTemplate = payload.template ?? {
        ...deletePrompt,
        isActive: false,
      };

      setTemplates((current) =>
        current.map((template) =>
          template.id === updatedTemplate.id ? updatedTemplate : template,
        ),
      );
      setSuccessMessage(
        `"${updatedTemplate.title}" has been removed from the active template library.`,
      );
      setDeletePrompt(null);
      await refreshTemplates();
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : "Unable to delete template.",
      );
    } finally {
      setDeletingId(null);
    }
  }

  async function submitTemplateSave(
    values: TemplateEditorValues,
    confirmDeactivation = false,
  ): Promise<void> {
    const formData = new FormData();
    formData.append("title", values.title);
    formData.append("contractType", values.contractType);
    formData.append("description", values.description ?? "");
    formData.append("variables", JSON.stringify(values.variables));
    formData.append("isActive", String(values.isActive));
    formData.append("isDefault", String(values.isDefault));

    if (values.file) {
      formData.append("file", values.file);
    }

    if (values.changeNote) {
      formData.append("changeNote", values.changeNote);
    }

    if (confirmDeactivation) {
      formData.append("confirmDeactivation", "DEACTIVATE");
    }

    const hasFileUpload = Boolean(values.file);
    const useUploadEndpoint =
      editorMode === "create" || (editorMode === "edit" && hasFileUpload);

    if (editorMode === "edit" && editingTemplate?.id) {
      if (useUploadEndpoint) {
        formData.append("templateId", editingTemplate.id);
      }
    }

    const response = await fetch(
      useUploadEndpoint
        ? "/api/templates/upload"
        : `/api/templates/${editingTemplate?.id}`,
      {
        method: useUploadEndpoint ? "POST" : "PATCH",
        body: formData,
      },
    );

    let body: {
      success?: boolean;
      template?: ContractTemplateRecord;
      error?: string;
      message?: string;
      inProgressCount?: number;
      defaultChangeMessage?: string | null;
      placeholderWarning?: string | null;
    };

    try {
      const responseText = await response.text();

      if (!responseText.trim()) {
        throw new Error(
          "Server returned an unexpected response. Please try again.",
        );
      }

      body = JSON.parse(responseText) as typeof body;
    } catch {
      throw new Error(
        "Server returned an unexpected response. Please try again.",
      );
    }

    if (response.status === 409 && body.error === "deactivation_confirmation_required") {
      setDeactivationPrompt({
        values,
        inProgressCount: body.inProgressCount ?? 0,
        message:
          body.message ??
          "This template is currently being used by contracts in progress.",
      });
      setDeactivationConfirmText("");
      return;
    }

    if (!response.ok) {
      throw new Error(body.error ?? "Upload failed. Please try again.");
    }

    if (body.template) {
      setTemplates((current) =>
        mergeTemplateLists([body.template!], current),
      );

      if (editorMode === "create") {
        setTypeFilter("");
        setSearchQuery("");
      }

      if (editorMode === "edit") {
        setEditingTemplate(body.template);
      }
    }

    if (body.defaultChangeMessage) {
      setSuccessMessage(body.defaultChangeMessage);
    } else if (editorMode === "edit" && useUploadEndpoint) {
      setSuccessMessage(
        `"${body.template?.title ?? values.title}" version ${body.template?.version ?? ""} has been saved. The prior version was archived.`,
      );
    } else if (editorMode === "edit") {
      setSuccessMessage(
        `"${body.template?.title ?? values.title}" has been updated.`,
      );
    } else {
      setSuccessMessage(
        `"${body.template?.title ?? values.title}" has been added to your template library.`,
      );
    }

    if (useUploadEndpoint) {
      setUploadSuccess({
        title: body.template?.title ?? values.title,
        placeholderWarning: body.placeholderWarning ?? null,
      });
      scheduleEditorClose();
      return;
    }

    await refreshTemplates();
    closeEditor();
  }

  async function handleSave(values: TemplateEditorValues): Promise<void> {
    if (editorMode === "create" && !values.file) {
      setError("Upload a Word document (.docx) to create a template.");
      return;
    }

    if (editorMode === "edit" && !editingTemplate?.id) {
      setError("No template selected for editing.");
      return;
    }

    if (!values.title.trim()) {
      setError("Template title is required.");
      return;
    }

    setIsSaving(true);
    setError(null);
    setSuccessMessage(null);

    try {
      await submitTemplateSave(values);
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Unable to save template.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function handleConfirmDeactivation(): Promise<void> {
    if (!deactivationPrompt || deactivationConfirmText !== "DEACTIVATE") {
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      await submitTemplateSave(deactivationPrompt.values, true);
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Unable to save template.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <>
      <div className="space-y-6" data-organization-id={organizationId}>
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">
              Contract templates
            </h2>
            <p className="mt-0.5 text-sm text-gray-500">
              {templates.length} template{templates.length === 1 ? "" : "s"} in
              your library
            </p>
          </div>
          {isLegalUser ? (
            <button
              type="button"
              onClick={openCreateEditor}
              disabled={isLoading}
              className="flex items-center gap-2 rounded-xl bg-[#3558A0] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#2a4a8f] disabled:opacity-60"
            >
              Upload template
            </button>
          ) : null}
        </div>

        <div className="mb-6 flex items-center gap-3">
          <div className="relative max-w-xs flex-1">
            <input
              type="text"
              placeholder="Search templates..."
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:border-[#3558A0] focus:outline-none focus:ring-2 focus:ring-[#3558A0]/25"
            />
          </div>

          <select
            value={typeFilter}
            onChange={(event) => setTypeFilter(event.target.value)}
            className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#3558A0]/25"
          >
            <option value="">All types</option>
            {contractTypes.map((type) => (
              <option key={type.id} value={type.slug}>
                {type.label}
              </option>
            ))}
          </select>

          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
            className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#3558A0]/25"
          >
            <option value="active">Active only</option>
            <option value="all">All including inactive</option>
            <option value="inactive">Inactive only</option>
          </select>

          <span className="ml-auto text-sm text-gray-400">
            {filteredTemplates.length} template
            {filteredTemplates.length === 1 ? "" : "s"}
          </span>
        </div>

        {successMessage ? (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            {successMessage}
          </div>
        ) : null}

        {error && !editorOpen ? (
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
            {error}
          </div>
        ) : null}

        {isLoading && templates.length === 0 ? (
          <TemplateTableSkeleton />
        ) : filteredTemplates.length > 0 ? (
          <TemplateListTable
            templates={filteredTemplates}
            contractTypes={contractTypes}
            isLegalUser={isLegalUser}
            downloadingId={downloadingId}
            openingId={openingId}
            deletingId={deletingId}
            onEdit={openEditEditor}
            onOpen={(template) => void handleOpen(template)}
            onDownload={(template) => void handleDownload(template)}
            onDelete={(template) => void handleDelete(template)}
          />
        ) : templates.length > 0 ? (
          <div className="rounded-xl border border-dashed border-gray-200 bg-white px-6 py-12 text-center">
            <p className="text-sm text-gray-500">
              No templates match your current filters.
            </p>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <p className="text-base font-medium text-gray-500">No templates yet</p>
            <p className="mt-1 max-w-xs text-sm text-gray-400">
              Upload your first Word document template to get started.
            </p>
            {isLegalUser ? (
              <button
                type="button"
                onClick={openCreateEditor}
                className="mt-6 rounded-xl bg-[#3558A0] px-4 py-2 text-sm font-medium text-white hover:bg-[#2a4a8f]"
              >
                Upload first template
              </button>
            ) : null}
          </div>
        )}
      </div>

      {isLegalUser ? (
        <TemplateEditor
          open={editorOpen}
          mode={editorMode}
          initialTemplate={editingTemplate}
          organizationId={organizationId}
          initialContractTypes={contractTypes}
          isSaving={isSaving}
          error={error}
          isLegalUser={isLegalUser}
          uploadSuccess={uploadSuccess}
          onContractTypesChange={setContractTypes}
          onClose={closeEditor}
          onSave={handleSave}
        />
      ) : null}

      {isLegalUser && deactivationPrompt ? (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/40 px-4">
          <div className="w-full max-w-lg rounded-xl border border-slate-200 bg-white p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-slate-900">
              Deactivate template?
            </h3>
            <p className="mt-3 text-sm leading-6 text-slate-600">
              {deactivationPrompt.message}
            </p>
            <label className="mt-5 block text-sm">
              <span className="mb-2 block font-medium text-slate-700">
                Type DEACTIVATE to confirm
              </span>
              <input
                type="text"
                value={deactivationConfirmText}
                onChange={(event) => setDeactivationConfirmText(event.target.value)}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
            </label>
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setDeactivationPrompt(null);
                  setDeactivationConfirmText("");
                }}
                className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={deactivationConfirmText !== "DEACTIVATE" || isSaving}
                onClick={() => void handleConfirmDeactivation()}
                className="rounded-md bg-rose-600 px-4 py-2 text-sm font-medium text-white hover:bg-rose-700 disabled:opacity-60"
              >
                {isSaving ? "Deactivating..." : "Deactivate template"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {isLegalUser && deletePrompt ? (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/40 px-4">
          <div className="w-full max-w-lg rounded-xl border border-slate-200 bg-white p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-slate-900">
              Delete template?
            </h3>
            <p className="mt-3 text-sm leading-6 text-slate-600">
              <span className="font-medium text-slate-900">
                {deletePrompt.title}
              </span>{" "}
              will be deactivated and removed from the active template library.
              Existing contracts using this template will not be affected.
            </p>
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeletePrompt(null)}
                disabled={deletingId === deletePrompt.id}
                className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={deletingId === deletePrompt.id}
                onClick={() => void confirmDelete()}
                className="rounded-md bg-rose-600 px-4 py-2 text-sm font-medium text-white hover:bg-rose-700 disabled:opacity-60"
              >
                {deletingId === deletePrompt.id
                  ? "Deleting..."
                  : "Delete template"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
