import { currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import {
  canManagePlatformSettings,
  getHomePathForEmail,
} from "@/lib/legal-access";
import { adminDashboardSectionHref } from "@/lib/admin-dashboard-sections";

export default async function WorkflowSettingsPage() {
  const user = await currentUser();

  if (!user) {
    redirect("/login");
  }

  const email = user.primaryEmailAddress?.emailAddress ?? "";

  if (!canManagePlatformSettings(email)) {
    redirect(getHomePathForEmail(email));
  }

  redirect(adminDashboardSectionHref("workflow-settings"));
}
