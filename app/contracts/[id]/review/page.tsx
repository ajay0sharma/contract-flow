import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { currentUser } from "@clerk/nextjs/server";
import { PageShell } from "@/components/PageShell";
import { ContractReviewForm } from "@/components/contracts/ContractReviewForm";
import { LifecycleTimeline } from "@/components/contracts/LifecycleTimeline";
import { StageBadge } from "@/components/contracts/StageBadge";
import {
  canViewContractRecord,
  getCurrentApprover,
  resolveContractRecordNumber,
} from "@/lib/contracts";
import { loadSyncedContractRecord } from "@/lib/contract-record-loader";
import { resolveClauseLibraryOrganizationId } from "@/lib/clause-library-org";
import { isSupportEmail } from "@/lib/access-control";

interface ReviewPageProps {
  params: Promise<{ id: string }>;
}

export default async function ReviewPage({ params }: ReviewPageProps) {
  const { id } = await params;
  const contract = await loadSyncedContractRecord(
    id,
    resolveClauseLibraryOrganizationId(),
  );
  const user = await currentUser();

  if (!user) {
    redirect("/login");
  }

  if (!contract) {
    notFound();
  }

  const userEmail = user.primaryEmailAddress?.emailAddress ?? "";
  if (!canViewContractRecord(contract, userEmail)) {
    notFound();
  }

  const currentApprover = getCurrentApprover(contract);

  if (
    isSupportEmail(userEmail) ||
    !currentApprover ||
    currentApprover.assigneeEmail.toLowerCase() !== userEmail.toLowerCase()
  ) {
    redirect(`/contracts/${contract.id}`);
  }

  return (
    <PageShell title="Review Contract">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm text-text-muted">
            {resolveContractRecordNumber(contract)}
          </p>
          <p className="mt-1 font-medium text-foreground">{contract.title}</p>
          <p className="mt-2 text-sm text-text-secondary">
            Requested by {contract.requesterName} · {contract.amount}
          </p>
        </div>
        <StageBadge stage={contract.stage} />
      </div>

      <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_1fr]">
        <div className="rounded-lg border border-border bg-surface p-6 shadow-sm">
          <h2 className="text-base font-semibold text-foreground">
            Contract summary
          </h2>
          <dl className="mt-5 space-y-4 text-sm">
            <div>
              <dt className="font-medium text-foreground">Type</dt>
              <dd className="text-text-secondary">{contract.contractType}</dd>
            </div>
            <div>
              <dt className="font-medium text-foreground">Counterparty</dt>
              <dd className="text-text-secondary">{contract.companyName}</dd>
            </div>
            <div>
              <dt className="font-medium text-foreground">Description</dt>
              <dd className="text-text-secondary">{contract.description}</dd>
            </div>
            <div>
              <dt className="font-medium text-foreground">Your step</dt>
              <dd className="text-text-secondary">
                {currentApprover.name} ({currentApprover.role})
              </dd>
            </div>
          </dl>
        </div>

        <ContractReviewForm contractId={contract.id} />
      </div>

      <section className="mt-8 rounded-lg border border-border bg-surface p-6 shadow-sm">
        <h2 className="text-base font-semibold text-foreground">
          Workflow progress
        </h2>
        <div className="mt-5">
          <LifecycleTimeline steps={contract.workflowSteps} />
        </div>
      </section>

      <div className="mt-8">
        <Link
          href={`/contracts/${contract.id}`}
          className="text-sm font-medium text-text-secondary hover:text-foreground"
        >
          ← Back to contract record
        </Link>
      </div>
    </PageShell>
  );
}
