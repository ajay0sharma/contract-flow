import { ComingSoonPage } from "@/components/layout/ComingSoonPage";
import { LegalShell } from "@/components/legal/LegalShell";
import { requireLegalPageUser } from "@/lib/page-auth";

export default async function LegalRiskPage() {
  await requireLegalPageUser();

  return (
    <LegalShell title="Risk dashboard">
      <ComingSoonPage title="Risk dashboard" />
    </LegalShell>
  );
}
