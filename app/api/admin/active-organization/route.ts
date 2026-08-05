import { NextRequest, NextResponse } from "next/server";
import {
  ACTIVE_ORGANIZATION_COOKIE,
  resolveActiveOrganizationId,
} from "@/lib/organization-context";
import { requireOrganizationAccess } from "@/lib/organization-membership";
import { requireAdminActor } from "@/lib/directory-route-utils";

export async function POST(request: NextRequest) {
  const auth = await requireAdminActor();

  if ("response" in auth) {
    return auth.response;
  }

  let body: { organizationId?: string };

  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const requestedOrganizationId = body.organizationId?.trim();

  if (!requestedOrganizationId) {
    return NextResponse.json(
      { error: "organizationId is required." },
      { status: 400 },
    );
  }

  try {
    await requireOrganizationAccess(auth.actorEmail, requestedOrganizationId);
    const organizationId = await resolveActiveOrganizationId(
      auth.actorEmail,
      requestedOrganizationId,
    );

    const response = NextResponse.json({ organizationId });
    response.cookies.set(ACTIVE_ORGANIZATION_COOKIE, organizationId, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
    });

    return response;
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "You do not have access to this client organization.",
      },
      { status: 403 },
    );
  }
}
