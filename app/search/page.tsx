import { currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { PageShell } from "@/components/PageShell";
import { ContractSearchClient } from "@/components/search/ContractSearchClient";
import { listAllVisibleContractRecords } from "@/lib/contract-list-service";
import { getContractsVisibleTo } from "@/lib/contract-store";
import { allowMemoryPersistence } from "@/lib/persistence-mode";
import { getUserRole } from "@/lib/legal-access";

export default async function SearchPage() {
  const user = await currentUser();

  if (!user) {
    redirect("/login");
  }

  const email = user.primaryEmailAddress?.emailAddress ?? "";
  const role = getUserRole(email);
  const contracts = allowMemoryPersistence()
    ? getContractsVisibleTo(email)
    : await listAllVisibleContractRecords(email);
  const scopeLabel =
    role === "business"
      ? "General users can search all non-confidential records plus confidential records they requested."
      : role === "support"
        ? "Support users can search across all contract records, including confidential records."
        : "Legal and admin users can search across all contract records.";

  return (
    <PageShell title="Search">
      <ContractSearchClient contracts={contracts} scopeLabel={scopeLabel} />
    </PageShell>
  );
}
