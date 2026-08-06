import { redirect } from "next/navigation";

export default function LegacySignatureSettingsPage() {
  redirect("/admin/signature");
}
