import { NextResponse } from "next/server";
import { requireAdminOrganizationId } from "@/lib/organization-context";
import { requireAdminActor } from "@/lib/directory-route-utils";

export async function requireAdminOrganizationActor(
  request: Request,
): Promise<
  | { actorEmail: string; actorName: string; organizationId: string }
  | { response: NextResponse }
> {
  const auth = await requireAdminActor();

  if ("response" in auth) {
    return auth;
  }

  const organizationId = await requireAdminOrganizationId(
    auth.actorEmail,
    request,
  );

  if (organizationId instanceof NextResponse) {
    return { response: organizationId };
  }

  return {
    actorEmail: auth.actorEmail,
    actorName: auth.actorName,
    organizationId,
  };
}
