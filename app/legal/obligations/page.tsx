import { ObligationsReportClient } from "@/components/legal/ObligationsReportClient";
import { requireLegalPageUser } from "@/lib/page-auth";

export default async function LegalObligationsPage() {
  await requireLegalPageUser();

  return <ObligationsReportClient />;
}
