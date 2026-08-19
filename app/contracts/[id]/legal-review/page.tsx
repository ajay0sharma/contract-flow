import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { currentUser } from "@clerk/nextjs/server";
import { PageShell } from "@/components/PageShell";
import { LegalReviewComparisonPanel } from "@/components/contracts/LegalReviewComparisonPanel";
import { StageBadge } from "@/components/contracts/StageBadge";
import {
  canViewContractRecord,
  resolveContractRecordNumber,
} from "@/lib/contracts";
import { loadSyncedContractRecord } from "@/lib/contract-record-loader";
import { resolveClauseLibraryOrganizationId } from "@/lib/clause-library-org";
import { isLegalEmail } from "@/lib/legal-access";

interface LegalReviewPageProps {
  params: Promise<{ id: string }>;
}

export default async function LegalReviewPage({ params }: LegalReviewPageProps) {
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

  if (!isLegalEmail(userEmail)) {
    redirect(`/contracts/${contract.id}`);
  }

  return (
    <PageShell title="Legal Review Comparison">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm text-text-muted">
            {resolveContractRecordNumber(contract)}
          </p>
          <p className="mt-1 font-medium text-foreground">{contract.title}</p>
          <p className="mt-2 text-sm text-text-secondary">
            {contract.companyName} · {contract.contractType}
          </p>
        </div>
        <StageBadge stage={contract.stage} />
      </div>

      <div className="mt-8">
        <LegalReviewComparisonPanel
          contractId={contract.id}
          attachments={contract.attachments}
        />
      </div>

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
