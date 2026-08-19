"use client";

import { useState } from "react";
import { ActivateContractButton } from "@/components/contracts/ActivateContractButton";
import { ApprovalReassignDialog } from "@/components/contracts/ApprovalReassignDialog";
import { formatAuditTimestamp, formatContractDateTime } from "@/lib/format-dates";
import { useDeferredEffect } from "@/lib/use-deferred-effect";
import { isAwaitingLegalPickup } from "@/lib/legal-assignment";
import { getCurrentApprover, isAwaitingApproval } from "@/lib/workflow-engine";
import type { ContractRecord, WorkflowStep } from "@/types/contract";
import type { SignatureEnvelopeView } from "@/types/signature-integration";

function StepStatusIcon({ status }: { status: WorkflowStep["status"] }) {
  switch (status) {
    case "completed":
      return (
        <span
          className="flex h-6 w-6 items-center justify-center rounded-full bg-[#4A7C59] text-xs font-bold text-white"
          aria-hidden="true"
        >
          ✓
        </span>
      );
    case "current":
      return (
        <span
          className="relative flex h-6 w-6 items-center justify-center"
          aria-hidden="true"
        >
          <span className="absolute h-6 w-6 animate-ping rounded-full bg-[#3558A0] opacity-40" />
          <span className="relative flex h-6 w-6 items-center justify-center rounded-full bg-[#3558A0] text-xs font-bold text-white">
            ●
          </span>
        </span>
      );
    case "rejected":
      return (
        <span
          className="flex h-6 w-6 items-center justify-center rounded-full bg-rose-500 text-xs font-bold text-white"
          aria-hidden="true"
        >
          ✕
        </span>
      );
    case "skipped":
      return (
        <span
          className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-slate-300 bg-white text-sm font-bold text-slate-400"
          aria-hidden="true"
        >
          —
        </span>
      );
    default:
      return (
        <span
          className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-slate-300 bg-white"
          aria-hidden="true"
        />
      );
  }
}

function connectorColor(status: WorkflowStep["status"]): string {
  if (status === "completed") {
    return "bg-emerald-300";
  }

  if (status === "current" || status === "rejected") {
    return "bg-blue-200";
  }

  return "bg-slate-200";
}

function waitingSinceDate(
  contract: ContractRecord,
  stepIndex: number,
): string {
  const step = contract.workflowSteps[stepIndex];

  if (step?.assignedAt?.trim()) {
    return step.assignedAt;
  }

  for (let index = stepIndex - 1; index >= 0; index -= 1) {
    const completedAt = contract.workflowSteps[index]?.completedAt;

    if (completedAt) {
      return completedAt;
    }
  }

  return contract.createdAt;
}

function StepNote({ note }: { note: string }) {
  const [expanded, setExpanded] = useState(false);
  const needsToggle = note.length > 100;

  return (
    <div>
      <p
        className={`text-xs italic text-gray-500 ${expanded ? "" : "line-clamp-2"}`}
      >
        {note}
      </p>
      {needsToggle ? (
        <button
          type="button"
          onClick={() => setExpanded((current) => !current)}
          className="mt-1 text-xs font-medium text-blue-600 hover:text-blue-700"
        >
          {expanded ? "less" : "more"}
        </button>
      ) : null}
    </div>
  );
}

function resolveWorkflowSubtitle(contract: ContractRecord): string {
  if (contract.stage === "active") {
    const allComplete = contract.workflowSteps.every(
      (step) => step.status === "completed" || step.status === "skipped",
    );

    if (allComplete) {
      return "All approvals complete";
    }
  }

  if (contract.stage === "rejected") {
    const rejectedStep = contract.workflowSteps.find(
      (step) => step.status === "rejected",
    );
    return rejectedStep
      ? `Rejected at ${rejectedStep.name}`
      : "Contract rejected";
  }

  if (contract.stage === "awaiting_signature") {
    return "Awaiting countersignature";
  }

  if (isAwaitingLegalPickup(contract)) {
    return "Awaiting legal pickup";
  }

  const currentStep = contract.workflowSteps.find(
    (step) => step.status === "current",
  );

  if (currentStep) {
    return currentStep.assigneeEmail.trim()
      ? `Waiting on ${currentStep.assigneeName}`
      : "Awaiting assignment";
  }

  return "Approval workflow in progress";
}

interface WorkflowTimelineProps {
  contract: ContractRecord;
  userEmail: string;
  isPrivilegedUser: boolean;
  isLegalUser: boolean;
  actionPending: boolean;
  onApprove: () => void;
  onReject: () => void;
  onContractUpdated?: (contract: ContractRecord) => void;
}

export function WorkflowTimeline({
  contract,
  userEmail,
  isPrivilegedUser,
  isLegalUser,
  actionPending,
  onApprove,
  onReject,
  onContractUpdated,
}: WorkflowTimelineProps) {
  const [reassignOpen, setReassignOpen] = useState(false);
  const [pickupPending, setPickupPending] = useState(false);
  const [pickupError, setPickupError] = useState<string | null>(null);
  const [signatureLoading, setSignatureLoading] = useState(false);
  const [signatureError, setSignatureError] = useState<string | null>(null);
  const [signatureProviderName, setSignatureProviderName] = useState<string | null>(
    null,
  );
  const [signatureEnvelope, setSignatureEnvelope] =
    useState<SignatureEnvelopeView | null>(null);

  useDeferredEffect(() => {
    if (contract.stage !== "awaiting_signature" || !isPrivilegedUser) {
      setSignatureEnvelope(null);
      setSignatureError(null);
      setSignatureLoading(false);
      return;
    }

    setSignatureLoading(true);
    setSignatureError(null);

    void fetch(`/api/contracts/${contract.id}/signature-status`, {
      cache: "no-store",
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error("Unable to load signature status.");
        }

        return (await response.json()) as {
          displayName: string;
          envelope: SignatureEnvelopeView | null;
        };
      })
      .then((payload) => {
        setSignatureProviderName(payload.displayName);
        setSignatureEnvelope(payload.envelope);
      })
      .catch((error) => {
        setSignatureError(
          error instanceof Error ? error.message : "Unable to load signature status.",
        );
      })
      .finally(() => {
        setSignatureLoading(false);
      });
  }, [contract.id, contract.stage, isPrivilegedUser]);

  const awaitingLegalPickup = isAwaitingLegalPickup(contract);

  useDeferredEffect(() => {
    setPickupError(null);
  }, [contract.id, awaitingLegalPickup]);

  const rejectedStep = contract.workflowSteps.find(
    (step) => step.status === "rejected",
  );
  const normalizedUserEmail = userEmail.trim().toLowerCase();

  function canActOnStep(step: WorkflowStep): boolean {
    return (
      step.assigneeEmail.trim().toLowerCase() === normalizedUserEmail
    );
  }

  function canPickupStep(step: WorkflowStep): boolean {
    return (
      isLegalUser &&
      awaitingLegalPickup &&
      step.id === "legal" &&
      step.status === "current"
    );
  }

  async function handlePickup(): Promise<void> {
    setPickupPending(true);
    setPickupError(null);

    try {
      const response = await fetch(`/api/contracts/${contract.id}/pickup`, {
        method: "POST",
      });
      const payload = (await response.json().catch(() => null)) as
        | ContractRecord
        | { error?: string }
        | null;

      if (!response.ok) {
        throw new Error(
          payload && "error" in payload && payload.error
            ? payload.error
            : "Failed to pick up contract.",
        );
      }

      onContractUpdated?.(payload as ContractRecord);
    } catch (error) {
      setPickupError(
        error instanceof Error ? error.message : "Failed to pick up contract.",
      );
    } finally {
      setPickupPending(false);
    }
  }
  const canReassign =
    isPrivilegedUser &&
    isAwaitingApproval(contract) &&
    Boolean(getCurrentApprover(contract));

  return (
    <>
      <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
        <h2 className="text-base font-semibold text-gray-900">Approval workflow</h2>
        <p className="mt-1 text-xs text-gray-500">
          {resolveWorkflowSubtitle(contract)}
        </p>

        {canReassign ? (
          <div className="mt-4">
            <button
              type="button"
              disabled={actionPending}
              onClick={() => setReassignOpen(true)}
              className="rounded-md border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-medium text-indigo-800 hover:bg-indigo-100 disabled:opacity-60"
            >
              Re-route approval
            </button>
          </div>
        ) : null}

        <ol className="mt-5 space-y-0">
          {contract.workflowSteps.map((step, index) => {
            const isLast = index === contract.workflowSteps.length - 1;

          return (
            <li key={step.id} className="relative flex gap-3 pb-6 last:pb-0">
              {!isLast ? (
                <span
                  className={`absolute left-[11px] top-7 h-[calc(100%-12px)] w-0.5 ${connectorColor(step.status)}`}
                  aria-hidden="true"
                />
              ) : null}

              <div className="relative z-10 mt-0.5 shrink-0">
                <StepStatusIcon status={step.status} />
              </div>

              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-gray-900">{step.name}</p>
                <p className="text-xs text-gray-500">{step.assigneeName}</p>

                {step.status === "completed" ? (
                  <div className="mt-2 space-y-1">
                    {step.completedAt ? (
                      <p className="text-xs text-gray-400">
                        {formatAuditTimestamp(step.completedAt)}
                      </p>
                    ) : null}
                    {step.note ? <StepNote note={step.note} /> : null}
                  </div>
                ) : null}

                {step.status === "rejected" ? (
                  <div className="mt-2 space-y-1">
                    {step.completedAt ? (
                      <p className="text-xs text-gray-400">
                        {formatAuditTimestamp(step.completedAt)}
                      </p>
                    ) : null}
                    {step.note ? <StepNote note={step.note} /> : null}
                  </div>
                ) : null}

                {step.status === "current" ? (
                  <div className="mt-2 space-y-2">
                    <p className="text-xs text-amber-600">
                      Waiting since{" "}
                      {formatContractDateTime(
                        waitingSinceDate(contract, index),
                      )}
                    </p>
                    {step.status === "current" && canPickupStep(step) ? (
                      <div className="space-y-2">
                        <button
                          type="button"
                          disabled={actionPending || pickupPending}
                          onClick={() => void handlePickup()}
                          className="rounded-md bg-[#3558A0] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#2d4a88] disabled:opacity-60"
                        >
                          {pickupPending ? "Picking up..." : "Pick up"}
                        </button>
                        {pickupError ? (
                          <p className="text-xs text-rose-700">{pickupError}</p>
                        ) : null}
                      </div>
                    ) : null}
                    {step.status === "current" && canActOnStep(step) ? (
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          disabled={actionPending}
                          onClick={onApprove}
                          className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-60"
                        >
                          Approve
                        </button>
                        <button
                          type="button"
                          disabled={actionPending}
                          onClick={onReject}
                          className="rounded-md bg-rose-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-rose-700 disabled:opacity-60"
                        >
                          Reject
                        </button>
                      </div>
                    ) : null}
                  </div>
                ) : null}

                {step.status === "upcoming" || step.status === "skipped" ? (
                  <p className="mt-1 text-xs text-gray-400">
                    {step.status === "skipped" ? "Skipped" : null}
                  </p>
                ) : null}
              </div>
            </li>
          );
        })}
      </ol>

      {contract.stage === "awaiting_signature" ? (
        <div className="mt-5 rounded-lg border border-teal-200 bg-teal-50 p-4">
          <div className="flex items-start gap-3">
            <span className="text-lg text-teal-700" aria-hidden="true">
              ✎
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-teal-900">
                Ready for signature
              </p>
              <p className="mt-1 text-xs text-teal-800">
                All approvals are complete. This contract is awaiting
                countersignature.
              </p>
              {signatureLoading ? (
                <p className="mt-3 text-xs text-teal-700">
                  Loading signature status…
                </p>
              ) : null}
              {signatureError ? (
                <p className="mt-3 text-xs text-rose-700">{signatureError}</p>
              ) : null}
              {signatureEnvelope ? (
                <div className="mt-3 rounded-md border border-teal-200 bg-white/70 px-3 py-2 text-xs text-teal-900">
                  <p className="font-medium">
                    Sent via {signatureProviderName ?? "e-signature"}
                  </p>
                  <p className="mt-1 capitalize">
                    Status: {signatureEnvelope.status.replaceAll("_", " ")}
                  </p>
                  {signatureEnvelope.sentAt ? (
                    <p className="mt-1">
                      Sent {formatAuditTimestamp(signatureEnvelope.sentAt)}
                    </p>
                  ) : null}
                </div>
              ) : null}
              {isPrivilegedUser ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  <ActivateContractButton contractId={contract.id} />
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {contract.stage === "active" ? (
        <div className="mt-5 rounded-lg border border-emerald-200 bg-emerald-50 p-4">
          <div className="flex items-start gap-3">
            <span className="text-lg text-emerald-700" aria-hidden="true">
              ✓
            </span>
            <div>
              <p className="text-sm font-medium text-emerald-900">
                Contract is active
              </p>
              {contract.activatedAt ? (
                <p className="mt-1 text-xs text-emerald-800">
                  Activated {formatAuditTimestamp(contract.activatedAt)}
                </p>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {contract.stage === "rejected" ? (
        <div className="mt-5 rounded-lg border border-rose-200 bg-rose-50 p-4">
          <div className="flex items-start gap-3">
            <span className="text-lg text-rose-700" aria-hidden="true">
              ✕
            </span>
            <div>
              <p className="text-sm font-medium text-rose-900">
                Contract rejected
              </p>
              {rejectedStep?.note ? (
                <p className="mt-1 text-xs text-rose-800">{rejectedStep.note}</p>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
      </div>

      <ApprovalReassignDialog
        open={reassignOpen}
        contract={contract}
        onClose={() => setReassignOpen(false)}
        onReassigned={(updated) => {
          onContractUpdated?.(updated);
        }}
      />
    </>
  );
}
