import { redirect } from "next/navigation";
import { requireAdminPageUser } from "@/lib/page-auth";

export default async function AdminSettingsPage() {
  await requireAdminPageUser();
  redirect("/admin/dashboard");
}
