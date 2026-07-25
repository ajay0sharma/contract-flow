import { ComingSoonPage } from "@/components/layout/ComingSoonPage";
import { LegalShell } from "@/components/legal/LegalShell";
import { requireLegalPageUser } from "@/lib/page-auth";

export default async function LegalWorkflowSettingsPage() {
  await requireLegalPageUser();

  return (
    <LegalShell title="Workflow settings">
      <ComingSoonPage title="Workflow settings" />
    </LegalShell>
  );
}
