import { redirect } from "next/navigation";
import { requireLegalPageUser } from "@/lib/page-auth";

export default async function RenewalsPage() {
  await requireLegalPageUser();
  redirect("/calendar");
}
