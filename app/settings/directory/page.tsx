import { currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { DirectoryIntegrationClient } from "@/components/settings/DirectoryIntegrationClient";
import { SettingsShell } from "@/components/settings/SettingsShell";
import {
  canManagePlatformSettings,
  getHomePathForEmail,
} from "@/lib/legal-access";

export default async function DirectorySettingsPage() {
  const user = await currentUser();

  if (!user) {
    redirect("/login");
  }

  const email = user.primaryEmailAddress?.emailAddress ?? "";

  if (!canManagePlatformSettings(email)) {
    redirect(getHomePathForEmail(email));
  }

  return (
    <SettingsShell
      title="User directory integration"
      description="Connect your company's Microsoft 365 or Google Workspace directory so employee names and emails are available throughout the system. Your IT team will need to complete the configuration below."
      isAdmin
    >
      <DirectoryIntegrationClient />
    </SettingsShell>
  );
}
