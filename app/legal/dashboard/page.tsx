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

  if (params.view === "pending") {
    redirect("/legal/dashboard?view=mine");
  }
  const explicitView =
    params.view === "all" ||
    params.view === "mine" ||
    params.view === "unassigned" ||
    params.view === "intake" ||
    params.view === "signature";
  const initialTab: "mine" | "unassigned" | "all" | "intake" | "signature" =
    params.view === "all"
      ? "all"
      : params.view === "intake"
        ? "intake"
        : params.view === "signature"
          ? "signature"
          : params.view === "unassigned"
            ? "unassigned"
            : "mine";
  const displayName = getUserDisplayName(user);

  return (
    <LegalShell title="Legal dashboard" description={`Welcome back, ${displayName}`}>
      <LegalDashboardClient
        initialTab={initialTab}
        explicitView={explicitView}
        userEmail={email}
      />
    </LegalShell>
  );
}
