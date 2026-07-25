import { redirect } from "next/navigation";
import { currentUser } from "@clerk/nextjs/server";
import { DashboardClient } from "@/components/dashboard/DashboardClient";
import { isAdminEmail, isLegalEmail } from "@/lib/legal-access";
import { getUserDisplayName } from "@/lib/user-display-name";

export default async function DashboardPage() {
  const user = await currentUser();

  if (!user) {
    redirect("/login");
  }

  const email = user.primaryEmailAddress?.emailAddress ?? "";

  if (isAdminEmail(email)) {
    redirect("/admin/dashboard");
  }

  if (isLegalEmail(email)) {
    redirect("/legal/dashboard");
  }

  const displayName = getUserDisplayName(user);

  return <DashboardClient displayName={displayName} />;
}
