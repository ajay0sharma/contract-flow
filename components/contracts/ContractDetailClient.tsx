"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useDeferredEffect } from "@/lib/use-deferred-effect";
import { PageShell } from "@/components/PageShell";
import { ContractStatusBadge } from "@/components/contracts/ContractStatusBadge";
import { StageBadge } from "@/components/contracts/StageBadge";
import { UploadContractAttachmentForm } from "@/components/contracts/UploadContractAttachmentForm";
import { ContractRelatedEmails } from "@/components/contracts/ContractRelatedEmails";
import { ContractESignatureSection } from "@/components/contracts/ContractESignatureSection";
import { ContractObligationsCard } from "@/components/contracts/ContractObligationsCard";
import { WorkflowTimeline } from "@/components/contracts/WorkflowTimeline";
import { PeoplePicker } from "@/components/shared/PeoplePicker";
import { useTier } from "@/components/providers/TierProvider";
import { isSupportEmail } from "@/lib/access-control";
import { getIntakeDocumentTypeLabel } from "@/lib/intake-documents";
import {
  formatAuditTimestamp,
  formatContractDate,
  formatContractDateTime,
  formatSubmittedTimestamp,
} from "@/lib/format-dates";
import {
  CONTRACT_TEMPLATE_TYPES,
  getContractTypeLabel,
} from "@/types/contract-template";
import type {
  AuditEvent,
  ContractAttachment,
  ContractLifecycleStatus,
  ContractRecord,
} from "@/types/contract";

interface ContractDetailClientProps {
  contractId: string;
  userEmail: string;
  userName: string;
  isPrivilegedUser: boolean;
  isLegalUser: boolean;
  directoryEnabled?: boolean;
  relationshipSection?: ReactNode;
}

type ApprovalAction = "approve" | "reject";

interface ApprovalModalState {
  action: ApprovalAction;
}

const CARD_CLASS = "rounded-2xl border border-gray-100 bg-white p-6 shadow-sm";
const CARD_HEADER_CLASS =
  "mb-4 border-b border-gray-100 pb-3 text-sm font-semibold uppercase tracking-wide text-gray-900";
const FIELD_LABEL_CLASS =
  "text-xs font-medium uppercase tracking-wide text-gray-500";
const FIELD_VALUE_CLASS = "mt-0.5 text-sm text-gray-900";
const EDIT_INPUT_BASE_CLASS =
  "w-full text-sm border border-gray-300 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500";
const CURRENCY_OPTIONS = [
  "USD",
  "EUR",
  "GBP",
  "CAD",
  "AUD",
  "SGD",
  "JPY",
  "CHF",
  "Other",
] as const;
const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: "$",
  EUR: "€",
  GBP: "£",
  CAD: "CA$",
  AUD: "A$",
  SGD: "S$",
  JPY: "¥",
  CHF: "CHF",
  Other: "",
};

type EditableContractFields = Partial<
  ContractRecord & {
    currency: string;
  }
>;

function editCardClass(isEditing: boolean, baseClass: string): string {
  return isEditing ? `${baseClass} border-l-4 border-l-blue-400` : baseClass;
}

function editInputClass(changed: boolean, extraClass = ""): string {
  return `${EDIT_INPUT_BASE_CLASS} ${extraClass} ${
    changed ? "bg-amber-50 border-amber-300" : ""
  }`.trim();
}

function formatDateInputValue(value: string | null | undefined): string {
  if (!value?.trim()) {
    return "";
  }

  const trimmed = value.trim();

  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return trimmed;
  }

  const parsed = new Date(trimmed);

  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString().slice(0, 10);
  }

  return trimmed;
}

function readCurrency(contract: ContractRecord): string {
  return (
    readContractVariable(contract, ["currency"]) ??
    contract.contractVariables?.currency ??
    "USD"
  );
}

function valuesEqual(left: unknown, right: unknown): boolean {
  if (left === right) {
    return true;
  }

  if (left == null && right == null) {
    return true;
  }

  return String(left ?? "") === String(right ?? "");
}

function buildContractPatchBody(
  contract: ContractRecord,
  editedFields: EditableContractFields,
): Record<string, unknown> {
  const patch: Record<string, unknown> = {};

  const scalarFields = [
    "title",
    "contractType",
    "department",
    "description",
    "otherNotes",
    "confidential",
    "companyName",
    "address",
    "mainContactName",
    "mainContactTitle",
    "mainContactEmail",
    "mainContactPhone",
    "amount",
    "amountNumeric",
    "budgeted",
    "poNumber",
    "contractStartDate",
    "contractEndDate",
    "effectiveDate",
    "expiryDate",
    "stage",
    "contractStatus",
  ] as const;

  for (const field of scalarFields) {
    if (!(field in editedFields)) {
      continue;
    }

    const nextValue = editedFields[field];
    const currentValue = contract[field];

    if (!valuesEqual(nextValue, currentValue)) {
      patch[field] = nextValue;
    }
  }

  if ("currency" in editedFields) {
    const currentCurrency = readCurrency(contract);

    if (!valuesEqual(editedFields.currency, currentCurrency)) {
      patch.currency = editedFields.currency;
    }
  }

  return patch;
}

function PencilIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
    >
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  );
}

function SpinnerIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg
      className={`${className} animate-spin`}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  );
}

function ToggleSwitch({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
        checked ? "bg-blue-600" : "bg-gray-200"
      }`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
          checked ? "translate-x-6" : "translate-x-1"
        }`}
      />
    </button>
  );
}

const PUBLIC_AUDIT_ACTIONS = new Set([
  "Submitted contract",
  "Approved",
  "Approved with concerns",
  "Rejected",
  "Marked active",
  "Moved to awaiting signature",
  "Executed",
  "Expired",
  "Email sent",
  "Email captured",
]);

function formatFileSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function resolveContractStatus(
  contract: ContractRecord,
): ContractLifecycleStatus {
  if (contract.contractStatus) {
    return contract.contractStatus;
  }

  if (contract.stage === "active") return "active";
  if (contract.stage === "rejected") return "rejected";
  if (contract.stage === "expired") return "expired";
  if (contract.stage === "request") return "draft";

  return "pending";
}

function formatVariableLabel(key: string): string {
  return key
    .replace(/_/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function formatCurrencyValue(contract: ContractRecord): string | null {
  if (contract.amountNumeric > 0) {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(contract.amountNumeric);
  }

  return contract.amount?.trim() || null;
}

function readContractVariable(
  contract: ContractRecord,
  keys: string[],
): string | null {
  const variables = contract.contractVariables ?? {};

  for (const key of keys) {
    const value = variables[key]?.trim();
    if (value) {
      return value;
    }
  }

  return null;
}

function readAutoRenewal(contract: ContractRecord): string | null {
  const variableValue = readContractVariable(contract, [
    "auto_renewal",
    "autoRenewal",
  ]);

  if (variableValue) {
    return variableValue;
  }

  if (contract.otherNotes?.toLowerCase().includes("auto renewal")) {
    return "Yes";
  }

  return null;
}

function getRequesterInitials(requesterName: string): string {
  const words = requesterName
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (words.length === 0) {
    return "?";
  }

  if (words.length === 1) {
    return words[0].charAt(0).toUpperCase();
  }

  const firstInitial = words[0].charAt(0).toUpperCase();
  const lastInitial = words[words.length - 1].charAt(0).toUpperCase();

  return `${firstInitial}${lastInitial}`;
}

type ContractUrgency = "standard" | "urgent" | "critical";

function readContractUrgency(
  contract: ContractRecord,
): ContractUrgency | null {
  const extended = contract as ContractRecord & { urgency?: string | null };
  const raw =
    extended.urgency?.trim() ||
    readContractVariable(contract, ["urgency"]) ||
    null;

  if (!raw) {
    return null;
  }

  const normalized = raw.toLowerCase();

  if (
    normalized === "standard" ||
    normalized === "urgent" ||
    normalized === "critical"
  ) {
    return normalized;
  }

  return null;
}

function readBusinessPurpose(contract: ContractRecord): string | null {
  const extended = contract as ContractRecord & {
    businessPurpose?: string | null;
  };
  const value =
    extended.businessPurpose?.trim() || contract.description?.trim() || null;

  return value || null;
}

function UrgencyBadge({ urgency }: { urgency: ContractUrgency }) {
  if (urgency === "standard") {
    return (
      <span className="inline-flex rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-700">
        Standard
      </span>
    );
  }

  if (urgency === "urgent") {
    return (
      <span className="inline-flex rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-800">
        Urgent
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-100 px-2.5 py-1 text-xs font-medium text-rose-800">
      <span className="relative flex h-2 w-2">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rose-500 opacity-75" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-rose-600" />
      </span>
      Critical
    </span>
  );
}

function RequesterSection({ contract }: { contract: ContractRecord }) {
  const urgency = readContractUrgency(contract);
  const businessPurpose = readBusinessPurpose(contract);

  return (
    <section className={CARD_CLASS}>
      <h2 className={CARD_HEADER_CLASS}>Requested by</h2>

      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-100 text-sm font-semibold text-blue-700">
          {getRequesterInitials(contract.requesterName)}
        </div>
        <div className="flex flex-col">
          <p className="text-sm font-medium text-gray-900">
            {contract.requesterName}
          </p>
          <p className="text-sm text-gray-500">{contract.requesterEmail}</p>
          {contract.department?.trim() ? (
            <p className="text-xs text-gray-400">
              Department: {contract.department}
            </p>
          ) : null}
        </div>
      </div>

      {urgency ? (
        <div className="mt-4 grid grid-cols-2 gap-4 border-t border-gray-100 pt-4">
          <div>
            <p className={FIELD_LABEL_CLASS}>Submitted</p>
            <p className={FIELD_VALUE_CLASS}>
              {formatSubmittedTimestamp(contract.createdAt)}
            </p>
          </div>
          <div>
            <p className={FIELD_LABEL_CLASS}>Urgency</p>
            <div className="mt-0.5">
              <UrgencyBadge urgency={urgency} />
            </div>
          </div>
        </div>
      ) : (
        <div className="mt-4 border-t border-gray-100 pt-4">
          <p className={FIELD_LABEL_CLASS}>Submitted</p>
          <p className={FIELD_VALUE_CLASS}>
            {formatSubmittedTimestamp(contract.createdAt)}
          </p>
        </div>
      )}

      {businessPurpose ? (
        <div className="mt-4 border-t border-gray-100 pt-4">
          <p className="mb-1 text-xs font-medium uppercase tracking-wide text-gray-500">
            Business purpose
          </p>
          <p className="text-sm leading-relaxed text-gray-700">
            {businessPurpose}
          </p>
        </div>
      ) : null}
    </section>
  );
}

function filterAuditEvents(
  events: AuditEvent[],
  isPrivilegedUser: boolean,
  userEmail: string,
): AuditEvent[] {
  if (isPrivilegedUser) {
    return events;
  }

  const normalizedEmail = userEmail.trim().toLowerCase();

  return events.filter((event) => {
    if (event.actorEmail.trim().toLowerCase() === normalizedEmail) {
      return true;
    }

    if (event.action === "Pending review") {
      return false;
    }

    if (/internal legal/i.test(event.detail) || /legal note/i.test(event.action)) {
      return false;
    }

    return PUBLIC_AUDIT_ACTIONS.has(event.action);
  });
}

function DetailField({
  label,
  value,
}: {
  label: string;
  value: string | null | undefined;
}) {
  return (
    <div>
      <dt className={FIELD_LABEL_CLASS}>{label}</dt>
      <dd className={FIELD_VALUE_CLASS}>{value?.trim() || "—"}</dd>
    </div>
  );
}

function FileTypeIcon({ mimeType }: { mimeType: string }) {
  if (mimeType === "application/pdf") {
    return (
      <span className="text-rose-600" aria-hidden="true">
        PDF
      </span>
    );
  }

  if (mimeType.startsWith("image/")) {
    return (
      <span className="text-blue-600" aria-hidden="true">
        IMG
      </span>
    );
  }

  return (
    <span className="text-gray-500" aria-hidden="true">
      DOC
    </span>
  );
}

function AttachmentRow({ attachment }: { attachment: ContractAttachment }) {
  const dataUrl = `data:${attachment.mimeType};base64,${attachment.dataBase64}`;

  return (
    <div className="flex items-start gap-3 border-t border-gray-100 pt-4 first:border-t-0 first:pt-0">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gray-50 text-xs font-semibold">
        <FileTypeIcon mimeType={attachment.mimeType} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-gray-900">{attachment.fileName}</p>
        <p className="mt-0.5 text-xs text-gray-500">
          {getIntakeDocumentTypeLabel(attachment.documentType)} ·{" "}
          {formatFileSize(attachment.sizeBytes)}
        </p>
        <p className="mt-0.5 text-xs text-gray-500">
          Uploaded by {attachment.uploadedByName} on{" "}
          {formatContractDateTime(attachment.uploadedAt)}
        </p>
      </div>
      <a
        href={dataUrl}
        download={attachment.fileName}
        className="shrink-0 rounded-md border border-gray-200 px-3 py-1.5 text-xs font-medium text-blue-700 hover:bg-gray-50"
      >
        Download
      </a>
    </div>
  );
}

function ContractAuditTrailSection({
  events,
  isPrivilegedUser,
  userEmail,
}: {
  events: AuditEvent[];
  isPrivilegedUser: boolean;
  userEmail: string;
}) {
  const [showAll, setShowAll] = useState(false);
  const filteredEvents = useMemo(
    () => filterAuditEvents(events, isPrivilegedUser, userEmail),
    [events, isPrivilegedUser, userEmail],
  );
  const sortedEvents = useMemo(
    () =>
      [...filteredEvents].sort(
        (a, b) =>
          new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
      ),
    [filteredEvents],
  );
  const visibleEvents = showAll ? sortedEvents : sortedEvents.slice(0, 10);

  return (
    <section className={CARD_CLASS}>
      <h2 className={CARD_HEADER_CLASS}>Audit trail</h2>

      {sortedEvents.length === 0 ? (
        <p className="text-sm text-gray-500">No audit events recorded yet.</p>
      ) : (
        <>
          <ol className="space-y-4">
            {visibleEvents.map((event) => (
              <li
                key={event.id}
                className="border-t border-gray-100 pt-4 first:border-t-0 first:pt-0"
              >
                <p className="text-xs text-gray-500">
                  {formatAuditTimestamp(event.timestamp)}
                </p>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <p className="text-sm font-medium text-gray-900">
                    {event.actorName}
                  </p>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      event.action === "Edited"
                        ? "bg-amber-100 text-amber-800"
                        : "bg-gray-100 text-gray-700"
                    }`}
                  >
                    {event.action}
                  </span>
                </div>
                <p className="mt-1 text-sm text-gray-600">{event.detail}</p>
                {event.fieldsUpdated && event.fieldsUpdated.length > 0 ? (
                  <p className="mt-1 text-xs text-gray-500">
                    Fields updated: {event.fieldsUpdated.join(", ")}
                  </p>
                ) : null}
              </li>
            ))}
          </ol>

          {sortedEvents.length > 10 ? (
            <button
              type="button"
              onClick={() => setShowAll((current) => !current)}
              className="mt-4 text-sm font-medium text-blue-700 hover:text-blue-800"
            >
              {showAll
                ? "Show fewer"
                : `Show all ${sortedEvents.length} events`}
            </button>
          ) : null}
        </>
      )}
    </section>
  );
}

async function fetchContract(contractId: string): Promise<ContractRecord> {
  const response = await fetch(`/api/contracts/${contractId}`, {
    cache: "no-store",
  });

  if (!response.ok) {
    const data = (await response.json().catch(() => null)) as {
      error?: string;
    } | null;
    throw new Error(data?.error ?? "Failed to load contract");
  }

  return (await response.json()) as ContractRecord;
}

export function ContractDetailClient({
  contractId,
  userEmail,
  userName,
  isPrivilegedUser,
  isLegalUser,
  directoryEnabled = false,
  relationshipSection = null,
}: ContractDetailClientProps) {
  const searchParams = useSearchParams();
  const [contract, setContract] = useState<ContractRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionPending, setActionPending] = useState(false);
  const [approvalModal, setApprovalModal] = useState<ApprovalModalState | null>(
    null,
  );
  const [approvalNote, setApprovalNote] = useState("");
  const [toast, setToast] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editedFields, setEditedFields] = useState<EditableContractFields>({});
  const [savePending, setSavePending] = useState(false);
  const [departments, setDepartments] = useState<string[]>([]);
  const [endDateError, setEndDateError] = useState<string | null>(null);

  const loadContract = useCallback(async () => {
    setError(null);

    try {
      const record = await fetchContract(contractId);
      setContract(record);
    } catch (loadError) {
      setContract(null);
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Failed to load contract",
      );
    } finally {
      setLoading(false);
    }
  }, [contractId]);

  const refreshContract = useCallback(async () => {
    try {
      const record = await fetchContract(contractId);
      setContract(record);
    } catch (loadError) {
      setToast({
        type: "error",
        message:
          loadError instanceof Error
            ? loadError.message
            : "Failed to refresh attachments.",
      });
    }
  }, [contractId]);

  useDeferredEffect(() => {
    void loadContract();
  }, [loadContract]);

  useDeferredEffect(() => {
    if (searchParams.get("edit") !== "1" || !contract || !isPrivilegedUser) {
      return;
    }

    setIsEditing(true);
  }, [contract, isPrivilegedUser, searchParams]);

  useEffect(() => {
    if (window.location.hash !== "#e-signature" || !contract) {
      return;
    }

    const target = document.getElementById("e-signature");

    if (target) {
      target.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [contract, isEditing]);

  useEffect(() => {
    if (!isPrivilegedUser) {
      return;
    }

    void fetch("/api/directory/departments", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : []))
      .then((data: unknown) => {
        if (Array.isArray(data)) {
          setDepartments(data.filter((entry) => typeof entry === "string"));
        }
      })
      .catch(() => {
        setDepartments([]);
      });
  }, [isPrivilegedUser]);

  const displayContract = useMemo(() => {
    if (!contract) {
      return null;
    }

    const merged = { ...contract, ...editedFields };

    if ("currency" in editedFields) {
      merged.contractVariables = {
        ...(contract.contractVariables ?? {}),
        currency: editedFields.currency ?? readCurrency(contract),
      };
    }

    return merged;
  }, [contract, editedFields]);

  useEffect(() => {
    if (!displayContract) {
      return;
    }

    document.title = displayContract.title
      ? `${displayContract.title} · Contract`
      : "Contract";
  }, [displayContract?.title, displayContract]);

  const { tier } = useTier();
  const canEditRecord = isPrivilegedUser;

  function handleCancelEdit(): void {
    if (Object.keys(editedFields).length === 0) {
      setIsEditing(false);
      setEndDateError(null);
      return;
    }

    const confirmed = window.confirm(
      "You have unsaved changes. Are you sure you want to discard them?",
    );

    if (!confirmed) {
      return;
    }

    setEditedFields({});
    setIsEditing(false);
    setEndDateError(null);
  }

  async function handleSaveChanges(): Promise<void> {
    if (!contract) {
      return;
    }

    if (endDateError) {
      return;
    }

    const patchBody = buildContractPatchBody(contract, editedFields);

    if (Object.keys(patchBody).length === 0) {
      setIsEditing(false);
      setEditedFields({});
      return;
    }

    setSavePending(true);
    setToast(null);

    try {
      const response = await fetch(`/api/contracts/${contractId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patchBody),
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(data?.error ?? "Failed to save changes");
      }

      const updated = (await response.json()) as ContractRecord;
      setContract(updated);
      setEditedFields({});
      setIsEditing(false);
      setEndDateError(null);
      setToast({
        type: "success",
        message: "Contract record updated successfully",
      });
    } catch (saveError) {
      console.error(saveError);
      setToast({
        type: "error",
        message: "Failed to save changes. Please try again.",
      });
    } finally {
      setSavePending(false);
    }
  }

  function updateEditedField<K extends keyof EditableContractFields>(
    field: K,
    value: EditableContractFields[K],
  ): void {
    setEditedFields((previous) => ({ ...previous, [field]: value }));
  }

  function validateEndDate(startDate: string, endDate: string): void {
    if (!startDate || !endDate) {
      setEndDateError(null);
      return;
    }

    if (endDate < startDate) {
      setEndDateError("End date cannot be before start date.");
      return;
    }

    setEndDateError(null);
  }

  function isFieldChanged(field: keyof EditableContractFields): boolean {
    return field in editedFields;
  }

  const contractStatus = contract ? resolveContractStatus(contract) : null;
  const showStageBadge =
    contractStatus === "draft" || contractStatus === "pending";
  const variableEntries = Object.entries(contract?.contractVariables ?? {});
  const currentStep = contract?.workflowSteps.find(
    (step) => step.status === "current",
  );
  const showFinancialCard = Boolean(
    contract?.amount?.trim() ||
      contract?.poNumber?.trim() ||
      (contract?.amountNumeric ?? 0) > 0,
  );
  const autoRenewal = contract ? readAutoRenewal(contract) : null;

  function openApprovalModal(action: ApprovalAction): void {
    setApprovalNote("");
    setApprovalModal({ action });
  }

  function closeApprovalModal(): void {
    setApprovalModal(null);
    setApprovalNote("");
  }

  async function submitApprovalAction(): Promise<void> {
    if (!approvalModal) {
      return;
    }

    if (approvalModal.action === "reject" && !approvalNote.trim()) {
      return;
    }

    setActionPending(true);
    setError(null);
    setToast(null);

    try {
      const response = await fetch(
        `/api/contracts/${contractId}/${approvalModal.action}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            note: approvalNote.trim() || undefined,
          }),
        },
      );

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(
          data?.error ?? `Failed to ${approvalModal.action} contract`,
        );
      }

      closeApprovalModal();
      await loadContract();

      if (approvalModal.action === "approve") {
        setToast({
          type: "success",
          message: "Step approved successfully.",
        });
      } else {
        setToast({
          type: "error",
          message: "Contract rejected",
        });
      }
    } catch (actionError) {
      setError(
        actionError instanceof Error
          ? actionError.message
          : `Failed to ${approvalModal.action} contract`,
      );
    } finally {
      setActionPending(false);
    }
  }

  if (loading) {
    return (
      <PageShell title="Contract">
        <div className="animate-pulse space-y-4">
          <div className="h-4 w-32 rounded bg-surface-muted" />
          <div className="h-8 w-2/3 rounded bg-surface-muted" />
          <div className="h-24 rounded bg-surface-muted" />
        </div>
      </PageShell>
    );
  }

  if (!contract) {
    return (
      <PageShell title="Contract not found">
        <p className="text-sm text-text-secondary">
          {error ?? "This contract could not be found or you do not have access."}
        </p>
        <Link
          href={isPrivilegedUser ? "/legal/dashboard" : "/dashboard"}
          className="mt-6 inline-block text-sm font-medium text-accent hover:text-accent-hover"
        >
          ← Back to dashboard
        </Link>
      </PageShell>
    );
  }

  const workflowSidebar = (
    <WorkflowTimeline
      contract={contract}
      userEmail={userEmail}
      isPrivilegedUser={isPrivilegedUser}
      actionPending={actionPending}
      onApprove={() => openApprovalModal("approve")}
      onReject={() => openApprovalModal("reject")}
      onContractUpdated={(updated) => setContract(updated)}
    />
  );

  const activeContract = displayContract ?? contract;
  const displayCurrency = readCurrency(activeContract);
  const showFinancialSection = showFinancialCard || isEditing;
  const showAttachmentUpload =
    (isEditing && isPrivilegedUser) || isSupportEmail(userEmail);

  const leftColumn = (
    <div className="flex min-w-0 flex-1 flex-col gap-5">
      {isEditing ? (
        <div
          className="flex items-center gap-3 rounded-xl border px-4 py-3 text-sm"
          style={
            tier === "legal" || tier === "admin"
              ? {
                  backgroundColor: "#F0F3F8",
                  borderColor: "#C5D1E8",
                  color: "#1E3054",
                }
              : {
                  backgroundColor: "#FFFBEB",
                  borderColor: "#FDE68A",
                  color: "#92400E",
                }
          }
        >
          <PencilIcon className="h-4 w-4 text-amber-600" />
          <p>
            You are editing this contract record. Changes are not saved until
            you click Save changes.
          </p>
        </div>
      ) : null}

      <header className="space-y-4 border-b border-gray-200 pb-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <p className="font-mono text-sm text-gray-500">
            {contract.recordNumber}
          </p>
          {canEditRecord ? (
            <div className="flex items-center gap-2">
              {isEditing ? (
                <>
                  <button
                    type="button"
                    onClick={handleCancelEdit}
                    disabled={savePending}
                    className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleSaveChanges()}
                    disabled={savePending || Boolean(endDateError)}
                    className="inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm text-white hover:opacity-90 disabled:opacity-50"
                    style={{
                      backgroundColor:
                        tier === "legal" || tier === "admin"
                          ? "#3558A0"
                          : "#2563EB",
                    }}
                  >
                    {savePending ? <SpinnerIcon /> : null}
                    Save changes
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => setIsEditing(true)}
                  className="flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-600 transition-colors hover:bg-gray-50"
                >
                  <PencilIcon />
                  Edit record
                </button>
              )}
            </div>
          ) : null}
        </div>

        {isEditing ? (
          <input
            type="text"
            value={editedFields.title ?? contract.title ?? ""}
            onChange={(event) => updateEditedField("title", event.target.value)}
            className={editInputClass(
              isFieldChanged("title"),
              "text-base font-semibold",
            )}
          />
        ) : (
          <h1 className="text-xl font-semibold text-gray-900">
            {activeContract.title}
          </h1>
        )}

        <div className="flex flex-wrap items-center gap-2">
          {contractStatus ? (
            <ContractStatusBadge status={contractStatus} />
          ) : null}
          {showStageBadge ? <StageBadge stage={contract.stage} /> : null}
          {activeContract.confidential ? (
            <span className="inline-flex rounded-full bg-rose-50 px-2.5 py-1 text-xs font-medium text-rose-900 ring-1 ring-inset ring-rose-200">
              Confidential
            </span>
          ) : null}
        </div>

        <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-gray-600">
          <p>
            Submitted {formatContractDate(contract.createdAt)} by{" "}
            {contract.requesterName}
          </p>
          {activeContract.amount?.trim() ? (
            <p className="font-medium text-gray-900">{activeContract.amount}</p>
          ) : null}
        </div>
      </header>

      <RequesterSection contract={activeContract} />

      <section className={editCardClass(isEditing, CARD_CLASS)}>
        <h2 className={CARD_HEADER_CLASS}>Contract details</h2>
        <div className="grid gap-8 md:grid-cols-2">
          <dl className="space-y-4">
            <div>
              <dt className={FIELD_LABEL_CLASS}>Contract type</dt>
              <dd className="mt-0.5">
                {isEditing ? (
                  <select
                    value={
                      editedFields.contractType ??
                      contract.contractType ??
                      ""
                    }
                    onChange={(event) =>
                      updateEditedField("contractType", event.target.value)
                    }
                    className={editInputClass(isFieldChanged("contractType"))}
                  >
                    {CONTRACT_TEMPLATE_TYPES.map((type) => (
                      <option key={type} value={type}>
                        {getContractTypeLabel(type)}
                      </option>
                    ))}
                  </select>
                ) : (
                  <p className={FIELD_VALUE_CLASS}>
                    {getContractTypeLabel(contract.contractType)}
                  </p>
                )}
              </dd>
            </div>

            <div>
              <dt className={FIELD_LABEL_CLASS}>Department</dt>
              <dd className="mt-0.5">
                {isEditing ? (
                  <>
                    <input
                      type="text"
                      list="contract-department-options"
                      value={editedFields.department ?? contract.department ?? ""}
                      onChange={(event) =>
                        updateEditedField("department", event.target.value)
                      }
                      className={editInputClass(isFieldChanged("department"))}
                    />
                    <datalist id="contract-department-options">
                      {departments.map((department) => (
                        <option key={department} value={department} />
                      ))}
                    </datalist>
                  </>
                ) : (
                  <p className={FIELD_VALUE_CLASS}>
                    {contract.department?.trim() || "—"}
                  </p>
                )}
              </dd>
            </div>

            <div>
              <dt className={FIELD_LABEL_CLASS}>Start date</dt>
              <dd className="mt-0.5">
                {isEditing ? (
                  <input
                    type="date"
                    value={formatDateInputValue(
                      editedFields.contractStartDate ??
                        contract.contractStartDate,
                    )}
                    onChange={(event) => {
                      const nextStart = event.target.value;
                      updateEditedField("contractStartDate", nextStart);
                      validateEndDate(
                        nextStart,
                        editedFields.contractEndDate ??
                          contract.contractEndDate ??
                          "",
                      );
                    }}
                    className={editInputClass(
                      isFieldChanged("contractStartDate"),
                    )}
                  />
                ) : (
                  <p className={FIELD_VALUE_CLASS}>
                    {contract.contractStartDate?.trim() || "—"}
                  </p>
                )}
              </dd>
            </div>

            <div>
              <dt className={FIELD_LABEL_CLASS}>End date</dt>
              <dd className="mt-0.5">
                {isEditing ? (
                  <>
                    <input
                      type="date"
                      value={formatDateInputValue(
                        editedFields.contractEndDate ?? contract.contractEndDate,
                      )}
                      onChange={(event) => {
                        const nextEnd = event.target.value;
                        updateEditedField("contractEndDate", nextEnd);
                        validateEndDate(
                          editedFields.contractStartDate ??
                            contract.contractStartDate ??
                            "",
                          nextEnd,
                        );
                      }}
                      className={editInputClass(
                        isFieldChanged("contractEndDate"),
                      )}
                    />
                    {endDateError ? (
                      <p className="mt-1 text-xs text-rose-600">
                        {endDateError}
                      </p>
                    ) : null}
                  </>
                ) : (
                  <p className={FIELD_VALUE_CLASS}>
                    {contract.contractEndDate?.trim() || "—"}
                  </p>
                )}
              </dd>
            </div>

            <div>
              <dt className={FIELD_LABEL_CLASS}>Expiry date</dt>
              <dd className="mt-0.5">
                {isEditing ? (
                  <input
                    type="date"
                    value={formatDateInputValue(
                      editedFields.expiryDate ?? contract.expiryDate ?? "",
                    )}
                    onChange={(event) =>
                      updateEditedField(
                        "expiryDate",
                        event.target.value
                          ? new Date(event.target.value).toISOString()
                          : null,
                      )
                    }
                    className={editInputClass(isFieldChanged("expiryDate"))}
                  />
                ) : contract.expiryDate ? (
                  <p className={FIELD_VALUE_CLASS}>
                    {formatContractDate(contract.expiryDate)}
                  </p>
                ) : (
                  <p className={FIELD_VALUE_CLASS}>—</p>
                )}
              </dd>
            </div>

            {autoRenewal && !isEditing ? (
              <DetailField label="Auto renewal" value={autoRenewal} />
            ) : null}

            {(isEditing || contract.description?.trim()) ? (
              <div>
                <dt className={FIELD_LABEL_CLASS}>Description</dt>
                <dd className="mt-0.5">
                  {isEditing ? (
                    <textarea
                      rows={3}
                      value={
                        editedFields.description ?? contract.description ?? ""
                      }
                      onChange={(event) =>
                        updateEditedField("description", event.target.value)
                      }
                      className={editInputClass(isFieldChanged("description"))}
                    />
                  ) : (
                    <p className={FIELD_VALUE_CLASS}>{contract.description}</p>
                  )}
                </dd>
              </div>
            ) : null}

            {(isEditing || contract.otherNotes?.trim()) ? (
              <div>
                <dt className={FIELD_LABEL_CLASS}>Other notes</dt>
                <dd className="mt-0.5">
                  {isEditing ? (
                    <textarea
                      rows={3}
                      value={editedFields.otherNotes ?? contract.otherNotes ?? ""}
                      onChange={(event) =>
                        updateEditedField("otherNotes", event.target.value)
                      }
                      className={editInputClass(isFieldChanged("otherNotes"))}
                    />
                  ) : (
                    <p className={FIELD_VALUE_CLASS}>{contract.otherNotes}</p>
                  )}
                </dd>
              </div>
            ) : null}

            <div>
              <dt className={FIELD_LABEL_CLASS}>Confidential</dt>
              <dd className="mt-0.5">
                {isEditing ? (
                  <ToggleSwitch
                    checked={
                      editedFields.confidential ?? contract.confidential ?? false
                    }
                    onChange={(checked) =>
                      updateEditedField("confidential", checked)
                    }
                    label="Confidential"
                  />
                ) : (
                  <p className={FIELD_VALUE_CLASS}>
                    {contract.confidential ? "Yes" : "No"}
                  </p>
                )}
              </dd>
            </div>
          </dl>

          <dl className="space-y-4">
            <div>
              <dt className={FIELD_LABEL_CLASS}>Counterparty name</dt>
              <dd className="mt-0.5">
                {isEditing ? (
                  <input
                    type="text"
                    value={
                      editedFields.companyName ?? contract.companyName ?? ""
                    }
                    onChange={(event) =>
                      updateEditedField("companyName", event.target.value)
                    }
                    className={editInputClass(isFieldChanged("companyName"))}
                  />
                ) : (
                  <p className={FIELD_VALUE_CLASS}>
                    {contract.companyName?.trim() || "—"}
                  </p>
                )}
              </dd>
            </div>

            <div>
              <dt className={FIELD_LABEL_CLASS}>Counterparty contact name</dt>
              <dd className="mt-0.5">
                {isEditing && directoryEnabled ? (
                  <PeoplePicker
                    label=""
                    value={{
                      email:
                        editedFields.mainContactEmail ??
                        contract.mainContactEmail ??
                        "",
                      name:
                        editedFields.mainContactName ??
                        contract.mainContactName ??
                        "",
                    }}
                    onChange={(person) => {
                      if (!person) {
                        updateEditedField("mainContactName", "");
                        return;
                      }

                      setEditedFields((previous) => ({
                        ...previous,
                        mainContactName: person.name,
                        mainContactEmail: person.email,
                        ...(person.jobTitle
                          ? { mainContactTitle: person.jobTitle }
                          : {}),
                      }));
                    }}
                  />
                ) : isEditing ? (
                  <input
                    type="text"
                    value={
                      editedFields.mainContactName ??
                      contract.mainContactName ??
                      ""
                    }
                    onChange={(event) =>
                      updateEditedField("mainContactName", event.target.value)
                    }
                    className={editInputClass(
                      isFieldChanged("mainContactName"),
                    )}
                  />
                ) : (
                  <p className={FIELD_VALUE_CLASS}>
                    {contract.mainContactName?.trim() || "—"}
                  </p>
                )}
              </dd>
            </div>

            <div>
              <dt className={FIELD_LABEL_CLASS}>Contact title</dt>
              <dd className="mt-0.5">
                {isEditing ? (
                  <input
                    type="text"
                    value={
                      editedFields.mainContactTitle ??
                      contract.mainContactTitle ??
                      ""
                    }
                    onChange={(event) =>
                      updateEditedField("mainContactTitle", event.target.value)
                    }
                    className={editInputClass(
                      isFieldChanged("mainContactTitle"),
                    )}
                  />
                ) : contract.mainContactTitle?.trim() ? (
                  <p className={FIELD_VALUE_CLASS}>
                    {contract.mainContactTitle}
                  </p>
                ) : (
                  <p className={FIELD_VALUE_CLASS}>—</p>
                )}
              </dd>
            </div>

            <div>
              <dt className={FIELD_LABEL_CLASS}>Counterparty email</dt>
              <dd className="mt-0.5">
                {isEditing ? (
                  <input
                    type="email"
                    value={
                      editedFields.mainContactEmail ??
                      contract.mainContactEmail ??
                      ""
                    }
                    onChange={(event) =>
                      updateEditedField("mainContactEmail", event.target.value)
                    }
                    className={editInputClass(
                      isFieldChanged("mainContactEmail"),
                    )}
                  />
                ) : (
                  <p className={FIELD_VALUE_CLASS}>
                    {contract.mainContactEmail?.trim() || "—"}
                  </p>
                )}
              </dd>
            </div>

            <div>
              <dt className={FIELD_LABEL_CLASS}>Counterparty phone</dt>
              <dd className="mt-0.5">
                {isEditing ? (
                  <input
                    type="tel"
                    value={
                      editedFields.mainContactPhone ??
                      contract.mainContactPhone ??
                      ""
                    }
                    onChange={(event) =>
                      updateEditedField("mainContactPhone", event.target.value)
                    }
                    className={editInputClass(
                      isFieldChanged("mainContactPhone"),
                    )}
                  />
                ) : contract.mainContactPhone?.trim() ? (
                  <p className={FIELD_VALUE_CLASS}>
                    {contract.mainContactPhone}
                  </p>
                ) : (
                  <p className={FIELD_VALUE_CLASS}>—</p>
                )}
              </dd>
            </div>

            <div>
              <dt className={FIELD_LABEL_CLASS}>Counterparty address</dt>
              <dd className="mt-0.5">
                {isEditing ? (
                  <textarea
                    rows={2}
                    value={editedFields.address ?? contract.address ?? ""}
                    onChange={(event) =>
                      updateEditedField("address", event.target.value)
                    }
                    className={editInputClass(isFieldChanged("address"))}
                  />
                ) : contract.address?.trim() ? (
                  <p className={FIELD_VALUE_CLASS}>{contract.address}</p>
                ) : (
                  <p className={FIELD_VALUE_CLASS}>—</p>
                )}
              </dd>
            </div>
          </dl>
        </div>
      </section>

      {showFinancialSection ? (
        <section className={editCardClass(isEditing, CARD_CLASS)}>
          <h2 className={CARD_HEADER_CLASS}>Financial details</h2>
          <dl className="space-y-4">
            <div>
              <dt className={FIELD_LABEL_CLASS}>Contract value</dt>
              <dd className="mt-0.5">
                {isEditing ? (
                  <div className="relative">
                    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-500">
                      {CURRENCY_SYMBOLS[displayCurrency] ?? displayCurrency}
                    </span>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={
                        editedFields.amountNumeric ??
                        contract.amountNumeric ??
                        ""
                      }
                      onChange={(event) => {
                        const numericValue = Number(event.target.value);
                        const safeNumeric = Number.isFinite(numericValue)
                          ? numericValue
                          : 0;
                        updateEditedField("amountNumeric", safeNumeric);
                        updateEditedField(
                          "amount",
                          safeNumeric > 0
                            ? new Intl.NumberFormat("en-US", {
                                style: "currency",
                                currency: displayCurrency === "Other"
                                  ? "USD"
                                  : displayCurrency,
                              }).format(safeNumeric)
                            : "",
                        );
                      }}
                      className={editInputClass(
                        isFieldChanged("amountNumeric") ||
                          isFieldChanged("amount"),
                        "pl-10",
                      )}
                    />
                  </div>
                ) : formatCurrencyValue(contract) ? (
                  <p className={FIELD_VALUE_CLASS}>
                    {formatCurrencyValue(contract)}
                  </p>
                ) : (
                  <p className={FIELD_VALUE_CLASS}>—</p>
                )}
              </dd>
            </div>

            <div>
              <dt className={FIELD_LABEL_CLASS}>Currency</dt>
              <dd className="mt-0.5">
                {isEditing ? (
                  <select
                    value={editedFields.currency ?? displayCurrency}
                    onChange={(event) =>
                      updateEditedField("currency", event.target.value)
                    }
                    className={editInputClass(isFieldChanged("currency"))}
                  >
                    {CURRENCY_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                ) : (
                  <p className={FIELD_VALUE_CLASS}>{displayCurrency}</p>
                )}
              </dd>
            </div>

            <div>
              <dt className={FIELD_LABEL_CLASS}>PO number</dt>
              <dd className="mt-0.5">
                {isEditing ? (
                  <input
                    type="text"
                    value={editedFields.poNumber ?? contract.poNumber ?? ""}
                    onChange={(event) =>
                      updateEditedField("poNumber", event.target.value)
                    }
                    className={editInputClass(isFieldChanged("poNumber"))}
                  />
                ) : contract.poNumber?.trim() ? (
                  <p className={FIELD_VALUE_CLASS}>{contract.poNumber}</p>
                ) : (
                  <p className={FIELD_VALUE_CLASS}>—</p>
                )}
              </dd>
            </div>

            <div>
              <dt className={FIELD_LABEL_CLASS}>Budgeted</dt>
              <dd className="mt-0.5">
                {isEditing ? (
                  <ToggleSwitch
                    checked={editedFields.budgeted ?? contract.budgeted ?? false}
                    onChange={(checked) =>
                      updateEditedField("budgeted", checked)
                    }
                    label="Budgeted"
                  />
                ) : contract.budgeted != null ? (
                  <span
                    className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${
                      contract.budgeted
                        ? "bg-emerald-50 text-emerald-800"
                        : "bg-gray-100 text-gray-700"
                    }`}
                  >
                    {contract.budgeted ? "Yes" : "No"}
                  </span>
                ) : (
                  <p className={FIELD_VALUE_CLASS}>—</p>
                )}
              </dd>
            </div>

            {!isEditing && readContractVariable(contract, [
              "payment_terms",
              "paymentTerms",
            ]) ? (
              <DetailField
                label="Payment terms"
                value={readContractVariable(contract, [
                  "payment_terms",
                  "paymentTerms",
                ])}
              />
            ) : null}
            {!isEditing && readContractVariable(contract, [
              "billing_frequency",
              "billingFrequency",
            ]) ? (
              <DetailField
                label="Billing frequency"
                value={readContractVariable(contract, [
                  "billing_frequency",
                  "billingFrequency",
                ])}
              />
            ) : null}
          </dl>
        </section>
      ) : null}

      {contract.templateId ? (
        <section className={CARD_CLASS}>
          <h2 className={CARD_HEADER_CLASS}>Template and document</h2>

          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className={FIELD_LABEL_CLASS}>Template</p>
              <p className={FIELD_VALUE_CLASS}>
                {contract.templateId}
                {contract.templateVersion
                  ? ` · v${contract.templateVersion}`
                  : ""}
              </p>
            </div>
            <a
              href={`/api/contracts/${contract.id}/template-download`}
              className="inline-flex rounded-md border border-gray-200 px-4 py-2 text-sm font-medium text-blue-700 hover:bg-gray-50"
            >
              Download template
            </a>
          </div>

          {variableEntries.length > 0 ? (
            <div className="mt-4 border-t border-gray-100 pt-4">
              <h3 className="text-sm font-semibold text-gray-900">
                Variable values
              </h3>
              <dl className="mt-4 grid gap-3 sm:grid-cols-2">
                {variableEntries.map(([key, value]) => (
                  <div key={key}>
                    <dt className={FIELD_LABEL_CLASS}>
                      {formatVariableLabel(key)}
                    </dt>
                    <dd className={FIELD_VALUE_CLASS}>{value}</dd>
                  </div>
                ))}
              </dl>
            </div>
          ) : null}
        </section>
      ) : null}

      {isPrivilegedUser ? (
        <ContractObligationsCard contractId={contract.id} />
      ) : null}

      <section className={editCardClass(isEditing, CARD_CLASS)}>
        <h2 className={CARD_HEADER_CLASS}>Attachments</h2>
        <p className="mt-1 text-sm text-gray-500">
          {isEditing && isPrivilegedUser
            ? "Upload supporting documents while you edit this record."
            : isSupportEmail(userEmail)
              ? "Upload agreements or supporting documents to this record."
              : "Documents uploaded to this contract record."}
        </p>

        {showAttachmentUpload ? (
          <div className="mt-4">
            <UploadContractAttachmentForm
              contractId={contract.id}
              variant={isEditing && isPrivilegedUser ? "detail" : "default"}
              onUploaded={() => {
                void refreshContract();
              }}
            />
          </div>
        ) : null}

        {contract.attachments.length === 0 ? (
          showAttachmentUpload ? null : (
          <p className="mt-4 text-sm text-gray-500">
            No attachments uploaded yet.
          </p>
          )
        ) : (
          <div className="mt-4 space-y-4">
            {contract.attachments.map((attachment) => (
              <AttachmentRow key={attachment.id} attachment={attachment} />
            ))}
          </div>
        )}
      </section>

      <ContractRelatedEmails
        contractId={contract.id}
        recordNumber={contract.recordNumber}
        emails={contract.relatedEmails ?? []}
        senderEmail={userEmail}
        defaultTo={contract.mainContactEmail?.trim() || ""}
        canSendEmail={isPrivilegedUser && !isSupportEmail(userEmail)}
        canAddEmail={!isSupportEmail(userEmail)}
        onEmailUpdated={() => {
          void loadContract();
        }}
      />

      {isLegalUser && contract?.stage === "awaiting_signature" && !isEditing ? (
        <section className="mt-6 rounded-2xl border border-teal-100 bg-teal-50 p-6 shadow-sm">
          <h2 className="text-base font-semibold text-teal-950">
            Ready for e-signature
          </h2>
          <p className="mt-1 text-sm text-teal-900">
            All required approvals are complete. Edit this record to confirm
            signer details and create the e-signature envelope.
          </p>
          <button
            type="button"
            onClick={() => setIsEditing(true)}
            className="mt-4 rounded-md bg-teal-700 px-4 py-2 text-sm font-medium text-white hover:bg-teal-800"
          >
            Edit record to send for signature
          </button>
        </section>
      ) : null}

      {isLegalUser && contract && contract.stage === "awaiting_signature" && isEditing ? (
        <ContractESignatureSection
          contract={contract}
          userEmail={userEmail}
          userName={userName}
          onEnvelopeSent={() => {
            void loadContract();
          }}
        />
      ) : null}

      {relationshipSection}

      <ContractAuditTrailSection
        events={contract.auditTrail}
        isPrivilegedUser={isPrivilegedUser}
        userEmail={userEmail}
      />

      <div>
        <Link
          href={isPrivilegedUser ? "/legal/dashboard" : "/dashboard"}
          className="text-sm font-medium text-gray-600 hover:text-gray-900"
        >
          ← Back to dashboard
        </Link>
      </div>
    </div>
  );

  return (
    <PageShell width="wide">
      {toast ? (
        <div
          className={`mb-6 rounded-lg border px-4 py-3 text-sm ${
            toast.type === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-900"
              : "border-rose-200 bg-rose-50 text-rose-900"
          }`}
        >
          {toast.message}
        </div>
      ) : null}

      {error ? (
        <div className="mb-6 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
          {error}
        </div>
      ) : null}

      <div className="flex flex-col items-start gap-8 lg:flex-row">
        <div className="order-2 w-full lg:order-1 lg:flex-1">{leftColumn}</div>
        <div className="order-1 w-full shrink-0 lg:order-2 lg:sticky lg:top-6 lg:w-80">
          {workflowSidebar}
        </div>
      </div>

      {approvalModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4">
          <div className="w-full max-w-lg rounded-xl border border-gray-200 bg-white p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-gray-900">
              {approvalModal.action === "approve"
                ? "Approve this step"
                : "Reject this step"}
            </h3>
            {currentStep ? (
              <p className="mt-2 text-sm text-gray-600">
                {currentStep.name} · {currentStep.assigneeName}
              </p>
            ) : null}
            <label className="mt-4 block text-sm font-medium text-gray-900">
              {approvalModal.action === "approve"
                ? "Add a note (optional)"
                : "Reason for rejection (required)"}
              <textarea
                value={approvalNote}
                onChange={(event) => setApprovalNote(event.target.value)}
                rows={4}
                className="mt-2 w-full rounded-md border border-gray-200 px-3 py-2 text-sm text-gray-900"
                placeholder={
                  approvalModal.action === "approve"
                    ? "Optional approval note"
                    : "Enter rejection reason"
                }
              />
            </label>
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={closeApprovalModal}
                disabled={actionPending}
                className="rounded-md border border-gray-200 px-4 py-2 text-sm font-medium text-gray-900 hover:bg-gray-50 disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void submitApprovalAction()}
                disabled={
                  actionPending ||
                  (approvalModal.action === "reject" && !approvalNote.trim())
                }
                className={`rounded-md px-4 py-2 text-sm font-medium text-white disabled:opacity-60 ${
                  approvalModal.action === "approve"
                    ? "bg-emerald-600 hover:bg-emerald-700"
                    : "bg-rose-600 hover:bg-rose-700"
                }`}
              >
                {actionPending
                  ? "Saving..."
                  : approvalModal.action === "approve"
                    ? "Confirm approval"
                    : "Confirm rejection"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </PageShell>
  );
}
