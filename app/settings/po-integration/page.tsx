import { currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { PoIntegrationClient } from "@/components/settings/PoIntegrationClient";
import { SettingsShell } from "@/components/settings/SettingsShell";
import {
  canManagePlatformSettings,
  getHomePathForEmail,
} from "@/lib/legal-access";

export default async function PoIntegrationSettingsPage() {
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
      title="Purchase order integration"
      description="Connect your PO system to automatically populate contract details when a PO number is entered."
      isAdmin
    >
      <PoIntegrationClient />
    </SettingsShell>
  );
}
