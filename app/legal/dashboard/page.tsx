import { redirect } from "next/navigation";
import { LegalShell } from "@/components/legal/LegalShell";
import { LegalDashboardClient } from "@/components/legal/LegalDashboardClient";
import { isLegalUser } from "@/lib/legal";
import { isAdminEmail } from "@/lib/legal-access";
import { requireAuthenticatedUser } from "@/lib/page-auth";
import { getUserDisplayName } from "@/lib/user-display-name";

interface LegalDashboardPageProps {
  searchParams: Promise<{ view?: string }>;
}

export default async function LegalDashboardPage({
  searchParams,
}: LegalDashboardPageProps) {
  const { user, email } = await requireAuthenticatedUser();

  if (!isLegalUser(email) && !isAdminEmail(email)) {
    redirect("/dashboard");
  }

  const params = await searchParams;
  const explicitView =
    params.view === "all" ||
    params.view === "pending" ||
    params.view === "intake" ||
    params.view === "signature";
  const initialTab: "pending" | "all" | "intake" | "signature" =
    params.view === "all"
      ? "all"
      : params.view === "intake"
        ? "intake"
        : params.view === "signature"
          ? "signature"
          : "pending";
  const displayName = getUserDisplayName(user);

  return (
    <LegalShell title="Legal dashboard" description={`Welcome back, ${displayName}`}>
      <LegalDashboardClient
        initialTab={initialTab}
        explicitView={explicitView}
      />
    </LegalShell>
  );
}
