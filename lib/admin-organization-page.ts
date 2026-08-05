import { redirect } from "next/navigation";
import { currentUser } from "@clerk/nextjs/server";
import { isAdminEmail } from "@/lib/access-control";
import { getHomePathForEmail } from "@/lib/legal-access";
import { resolveAdminOrganizationContext } from "@/lib/organization-context";
import type { AccessibleOrganization } from "@/lib/organization-membership";

export interface AdminOrganizationPageContext {
  email: string;
  organizationId: string;
  organizations: AccessibleOrganization[];
}

export async function requireAdminOrganizationPageContext(): Promise<AdminOrganizationPageContext> {
  const user = await currentUser();

  if (!user) {
    redirect("/login");
  }

  const email = user.primaryEmailAddress?.emailAddress?.trim() ?? "";

  if (!email || !isAdminEmail(email)) {
    redirect(getHomePathForEmail(email));
  }

  const context = await resolveAdminOrganizationContext(email);

  return {
    email,
    organizationId: context.organizationId,
    organizations: context.organizations,
  };
}
