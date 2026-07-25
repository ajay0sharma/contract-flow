import { LegalShell } from "@/components/legal/LegalShell";
import { ContractExpirationCalendar } from "@/components/legal/ContractExpirationCalendar";
import { requireLegalOrAdminPageUser } from "@/lib/page-auth";

export default async function CalendarPage() {
  await requireLegalOrAdminPageUser();

  return (
    <LegalShell
      title="Contract calendar"
      description="Track upcoming contract expiration dates across your portfolio."
    >
      <ContractExpirationCalendar />
    </LegalShell>
  );
}
