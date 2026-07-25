import { redirect } from "next/navigation";
import { requireAdminPage } from "@/app/actions/admin";
import { adminDashboardSectionHref } from "@/lib/admin-dashboard-sections";

export default async function AdminUsersPage() {
  await requireAdminPage();
  redirect(adminDashboardSectionHref("user-settings"));
}
