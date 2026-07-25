import { redirect } from "next/navigation";
import { currentUser } from "@clerk/nextjs/server";
import {
  getHomePathForEmail,
  isAdminEmail,
  isLegalEmail,
} from "@/lib/legal-access";
import type { UserTier } from "@/lib/user-tier";

export async function requireAuthenticatedUser() {
  const user = await currentUser();

  if (!user) {
    redirect("/login");
  }

  const email = user.primaryEmailAddress?.emailAddress?.trim() ?? "";

  if (!email) {
    redirect("/login");
  }

  return { user, email };
}

export async function requireTierUser(allowedTiers: UserTier[]) {
  const { user, email } = await requireAuthenticatedUser();
  const isAdmin = isAdminEmail(email);
  const isLegal = isLegalEmail(email);

  const tier: UserTier = isAdmin ? "admin" : isLegal ? "legal" : "general";

  if (!allowedTiers.includes(tier)) {
    redirect(getHomePathForEmail(email));
  }

  return { user, email, tier };
}

export async function requireLegalOrAdminPageUser() {
  return requireTierUser(["legal", "admin"]);
}

export async function requireLegalPageUser() {
  return requireTierUser(["legal"]);
}

export async function requireAdminPageUser() {
  return requireTierUser(["admin"]);
}
