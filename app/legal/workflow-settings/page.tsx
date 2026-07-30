import { redirect } from "next/navigation";
import { isAdminEmail } from "@/lib/legal-access";
import { adminDashboardSectionHref } from "@/lib/admin-dashboard-sections";
import { requireLegalOrAdminPageUser } from "@/lib/page-auth";

export default async function LegalWorkflowSettingsPage() {
  const { email } = await requireLegalOrAdminPageUser();

  if (isAdminEmail(email)) {
    redirect(adminDashboardSectionHref("workflow-settings"));
  }

  redirect("/legal/dashboard");
}
