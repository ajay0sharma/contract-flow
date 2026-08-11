import { LegalShell } from "@/components/legal/LegalShell";
import { RenewalsDashboardClient } from "@/components/legal/RenewalsDashboardClient";
import { requireLegalOrAdminPageUser } from "@/lib/page-auth";

export default async function RenewalsPage() {
  await requireLegalOrAdminPageUser();

  return (
    <LegalShell
      title="Renewals"
      description="Track contracts approaching expiration, notice deadlines, and renewal workflow status."
    >
      <RenewalsDashboardClient />
    </LegalShell>
  );
}
