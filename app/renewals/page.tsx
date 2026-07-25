import { ComingSoonPage } from "@/components/layout/ComingSoonPage";
import { LegalShell } from "@/components/legal/LegalShell";
import { requireLegalPageUser } from "@/lib/page-auth";

export default async function RenewalsPage() {
  await requireLegalPageUser();

  return (
    <LegalShell title="Renewals">
      <ComingSoonPage title="Renewals" />
    </LegalShell>
  );
}
