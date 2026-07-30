import { redirect } from "next/navigation";
import { requireLegalPageUser } from "@/lib/page-auth";

export default async function LegalRiskPage() {
  await requireLegalPageUser();
  redirect("/legal/dashboard");
}
