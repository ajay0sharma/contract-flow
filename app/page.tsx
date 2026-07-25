import { currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { getHomePathForEmail } from "@/lib/legal-access";

export default async function Home() {
  const user = await currentUser();

  if (!user) {
    redirect("/login");
  }

  const email = user.primaryEmailAddress?.emailAddress ?? "";

  redirect(getHomePathForEmail(email));
}
