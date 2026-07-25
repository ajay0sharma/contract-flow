import { LegalShell } from "@/components/legal/LegalShell";
import { LegalReportsClient } from "@/components/legal/LegalReportsClient";
import { LegalObligationReports } from "@/components/legal/LegalObligationReports";
import { getAllContractsBySubmissionDate } from "@/lib/legal";
import { getObligationReportEntries } from "@/lib/obligation-store";
import { requireLegalOrAdminPageUser } from "@/lib/page-auth";

export default async function LegalReportsPage() {
  await requireLegalOrAdminPageUser();

  const contracts = getAllContractsBySubmissionDate();
  const obligationEntries = await getObligationReportEntries(contracts);

  return (
    <LegalShell
      title="Legal Reports"
      description="Run reports across submitted contracts by type, counterparty, dollar value, expiration date, workflow stage, department, owner, and company obligations."
    >
      <div className="space-y-10">
        <LegalReportsClient contracts={contracts} />
        <LegalObligationReports entries={obligationEntries} />
      </div>
    </LegalShell>
  );
}
