import { NextResponse } from "next/server";
import { resolveAdminOrganizationContext } from "@/lib/organization-context";
import { requireAdminActor } from "@/lib/directory-route-utils";

export async function GET() {
  const auth = await requireAdminActor();

  if ("response" in auth) {
    return auth.response;
  }

  const context = await resolveAdminOrganizationContext(auth.actorEmail);

  return NextResponse.json({
    organizations: context.organizations,
    activeOrganizationId: context.organizationId,
  });
}
