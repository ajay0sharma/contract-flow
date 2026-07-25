"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { updateContractRecordAction } from "@/app/actions/contracts";
import { inputClassName, textareaClassName } from "@/components/ui/FormField";
import type { ContractRecord, ContractRecordUpdateInput } from "@/types/contract";

interface ContractRecordEditorProps {
  contract: ContractRecord;
  canEdit: boolean;
}

function buildInitialForm(contract: ContractRecord): ContractRecordUpdateInput {
  return {
    department: contract.department,
    contractType: contract.contractType,
    contractStartDate: contract.contractStartDate,
    contractEndDate: contract.contractEndDate,
    title: contract.title,
    description: contract.description,
    amount: contract.amount,
    budgeted: contract.budgeted,
    poNumber: contract.poNumber,
    supplierId: contract.supplierId,
    supplierName: contract.supplierName,
    otherNotes: contract.otherNotes,
    companyName: contract.companyName,
    address: contract.address,
    mainContactName: contract.mainContactName,
    mainContactTitle: contract.mainContactTitle,
    mainContactEmail: contract.mainContactEmail,
    mainContactPhone: contract.mainContactPhone,
  };
}

function DisplayField({
  label,
  value,
  className,
}: {
  label: string;
  value: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <dt className="text-xs font-medium uppercase tracking-wide text-text-muted">
        {label}
      </dt>
      <dd className="mt-1 text-sm text-foreground">{value || "—"}</dd>
    </div>
  );
}

function EditField({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={className}>
      <span className="mb-2 block text-sm font-medium text-foreground">
        {label}
      </span>
      {children}
    </label>
  );
}

export function ContractRecordEditor({
  contract,
  canEdit,
}: ContractRecordEditorProps) {
  const router = useRouter();
  const [isEditing, setIsEditing] = useState(false);
  const [form, setForm] = useState(() => buildInitialForm(contract));
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const hasAmount = form.amount.trim().length > 0;

  function updateField<K extends keyof ContractRecordUpdateInput>(
    field: K,
    value: ContractRecordUpdateInput[K],
  ): void {
    setForm((current) => {
      const next = { ...current, [field]: value };

      if (field === "amount" && String(value).trim().length === 0) {
        next.budgeted = null;
        next.poNumber = "";
        next.supplierId = "";
        next.supplierName = "";
      }

      return next;
    });
  }

  function resetAndLock(): void {
    setForm(buildInitialForm(contract));
    setError(null);
    setIsEditing(false);
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    setError(null);

    startTransition(async () => {
      try {
        await updateContractRecordAction(contract.id, form);
        setIsEditing(false);
        router.refresh();
      } catch (actionError) {
        setError(
          actionError instanceof Error
            ? actionError.message
            : "Unable to update contract record.",
        );
      }
    });
  }

  return (
    <div className="rounded-lg border border-border bg-surface p-6 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-foreground">
            Contract record
          </h2>
          <p className="mt-1 text-sm text-text-muted">
            {isEditing
              ? "Edit mode is enabled for legal."
              : "Locked. Legal users can unlock this record to edit fields."}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-surface-muted px-3 py-1 text-xs font-medium text-text-secondary">
            {isEditing ? "Edit mode" : "Locked"}
          </span>
          {canEdit && !isEditing ? (
            <button
              type="button"
              onClick={() => setIsEditing(true)}
              className="rounded-md bg-accent px-3 py-2 text-sm font-medium text-white hover:bg-accent-hover"
            >
              Edit record
            </button>
          ) : null}
        </div>
      </div>

      {!isEditing ? (
        <dl className="mt-5 grid gap-4 sm:grid-cols-2">
          <DisplayField label="Requester" value={contract.requesterName} />
          <DisplayField label="Department" value={form.department} />
          <DisplayField label="Contract type" value={form.contractType} />
          {contract.parentAgreementId ? (
            <DisplayField
              label="Parent agreement"
              value={`${contract.parentAgreementRecordNumber} · ${contract.parentAgreementTitle}`}
              className="sm:col-span-2"
            />
          ) : null}
          <DisplayField
            label="Term"
            value={`${form.contractStartDate} to ${form.contractEndDate}`}
          />
          <DisplayField label="Amount" value={form.amount} />
          {form.budgeted !== null ? (
            <DisplayField
              label="Budgeted"
              value={form.budgeted ? "Yes" : "No"}
            />
          ) : null}
          {form.amount.trim() ? (
            <DisplayField label="PO Number" value={form.poNumber} />
          ) : null}
          {form.amount.trim() ? (
            <DisplayField
              label="Supplier ID"
              value={form.supplierId}
            />
          ) : null}
          {form.amount.trim() ? (
            <DisplayField
              label="Supplier Name"
              value={form.supplierName}
            />
          ) : null}
          <DisplayField label="Counterparty" value={form.companyName} />
          <DisplayField
            label="Description"
            value={form.description}
            className="sm:col-span-2"
          />
          {form.otherNotes ? (
            <DisplayField
              label="Other notes"
              value={form.otherNotes}
              className="sm:col-span-2"
            />
          ) : null}
          <DisplayField label="Main Contact" value={form.mainContactName} />
          <DisplayField
            label="Main Contact Title"
            value={form.mainContactTitle}
          />
          <DisplayField
            label="Main Contact Email"
            value={form.mainContactEmail}
          />
          <DisplayField
            label="Main Contact Phone Number"
            value={form.mainContactPhone}
          />
          <DisplayField
            label="Address"
            value={form.address}
            className="sm:col-span-2"
          />
        </dl>
      ) : (
        <form onSubmit={handleSubmit} className="mt-5 space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <EditField label="Title" className="sm:col-span-2">
              <input
                value={form.title}
                onChange={(event) => updateField("title", event.target.value)}
                className={inputClassName}
                required
              />
            </EditField>
            <EditField label="Department">
              <input
                value={form.department}
                onChange={(event) =>
                  updateField("department", event.target.value)
                }
                className={inputClassName}
                required
              />
            </EditField>
            <EditField label="Contract type">
              <input
                value={form.contractType}
                onChange={(event) =>
                  updateField("contractType", event.target.value)
                }
                className={inputClassName}
                required
              />
            </EditField>
            <EditField label="Start date">
              <input
                type="date"
                value={form.contractStartDate}
                onChange={(event) =>
                  updateField("contractStartDate", event.target.value)
                }
                className={inputClassName}
                required
              />
            </EditField>
            <EditField label="End date">
              <input
                type="date"
                value={form.contractEndDate}
                onChange={(event) =>
                  updateField("contractEndDate", event.target.value)
                }
                className={inputClassName}
                required
              />
            </EditField>
            <EditField label="Amount">
              <input
                value={form.amount}
                onChange={(event) => updateField("amount", event.target.value)}
                className={inputClassName}
                placeholder="Optional"
              />
            </EditField>
            {hasAmount ? (
              <EditField label="Budgeted?">
                <select
                  value={
                    form.budgeted === null ? "" : form.budgeted ? "yes" : "no"
                  }
                  onChange={(event) =>
                    updateField(
                      "budgeted",
                      event.target.value === ""
                        ? null
                        : event.target.value === "yes",
                    )
                  }
                  className={inputClassName}
                >
                  <option value="">Select</option>
                  <option value="yes">Yes</option>
                  <option value="no">No</option>
                </select>
              </EditField>
            ) : null}
            {hasAmount ? (
              <EditField label="PO Number">
                <input
                  value={form.poNumber}
                  onChange={(event) =>
                    updateField("poNumber", event.target.value)
                  }
                  className={inputClassName}
                  placeholder="Optional"
                />
              </EditField>
            ) : null}
            {hasAmount ? (
              <EditField label="Supplier ID">
                <input
                  value={form.supplierId}
                  onChange={(event) =>
                    updateField("supplierId", event.target.value)
                  }
                  className={inputClassName}
                  placeholder="Optional procurement supplier ID"
                />
              </EditField>
            ) : null}
            {hasAmount ? (
              <EditField label="Supplier Name">
                <input
                  value={form.supplierName}
                  onChange={(event) =>
                    updateField("supplierName", event.target.value)
                  }
                  className={inputClassName}
                  placeholder="Optional procurement supplier name"
                />
              </EditField>
            ) : null}
            <EditField label="Counterparty">
              <input
                value={form.companyName}
                onChange={(event) =>
                  updateField("companyName", event.target.value)
                }
                className={inputClassName}
                required
              />
            </EditField>
            <EditField label="Main Contact">
              <input
                value={form.mainContactName}
                onChange={(event) =>
                  updateField("mainContactName", event.target.value)
                }
                className={inputClassName}
                required
              />
            </EditField>
            <EditField label="Main Contact Title">
              <input
                value={form.mainContactTitle}
                onChange={(event) =>
                  updateField("mainContactTitle", event.target.value)
                }
                className={inputClassName}
                placeholder="Optional"
              />
            </EditField>
            <EditField label="Main Contact Email">
              <input
                type="email"
                value={form.mainContactEmail}
                onChange={(event) =>
                  updateField("mainContactEmail", event.target.value)
                }
                className={inputClassName}
                required
              />
            </EditField>
            <EditField label="Main Contact Phone Number">
              <input
                value={form.mainContactPhone}
                onChange={(event) =>
                  updateField("mainContactPhone", event.target.value)
                }
                className={inputClassName}
                placeholder="Optional"
              />
            </EditField>
            <EditField label="Description" className="sm:col-span-2">
              <textarea
                value={form.description}
                onChange={(event) =>
                  updateField("description", event.target.value)
                }
                className={textareaClassName}
                rows={4}
                required
              />
            </EditField>
            <EditField label="Other notes" className="sm:col-span-2">
              <textarea
                value={form.otherNotes}
                onChange={(event) =>
                  updateField("otherNotes", event.target.value)
                }
                className={textareaClassName}
                rows={3}
              />
            </EditField>
            <EditField label="Address" className="sm:col-span-2">
              <textarea
                value={form.address}
                onChange={(event) => updateField("address", event.target.value)}
                className={textareaClassName}
                rows={3}
                required
              />
            </EditField>
          </div>

          {error ? (
            <p className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-900">
              {error}
            </p>
          ) : null}

          <div className="flex flex-wrap gap-3">
            <button
              type="submit"
              disabled={isPending}
              className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-60"
            >
              {isPending ? "Saving..." : "Save and lock"}
            </button>
            <button
              type="button"
              disabled={isPending}
              onClick={resetAndLock}
              className="rounded-md border border-border bg-surface px-4 py-2 text-sm font-medium text-text-secondary hover:bg-surface-muted disabled:opacity-60"
            >
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
