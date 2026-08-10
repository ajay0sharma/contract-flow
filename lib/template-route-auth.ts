import { currentUser } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { resolveActiveOrganizationId, resolveActiveOrganizationIdFromRequest } from "@/lib/organization-context";
import { requireOrganizationAccess } from "@/lib/organization-membership";
import { isAdminEmail, isLegalEmail } from "@/lib/legal-access";
import { getUserDisplayName } from "@/lib/user-display-name";

export interface TemplateApiActor {
  user: NonNullable<Awaited<ReturnType<typeof currentUser>>>;
  email: string;
  actorName: string;
}

export async function requireAuthenticatedTemplateReader():
  Promise<{ actor: TemplateApiActor } | { response: NextResponse }> {
  const user = await currentUser();

  if (!user) {
    return {
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  const email = user.primaryEmailAddress?.emailAddress ?? "";

  return {
    actor: {
      user,
      email,
      actorName: getUserDisplayName(user),
    },
  };
}

export function isTemplateManager(email: string): boolean {
  return isLegalEmail(email) || isAdminEmail(email);
}

export async function resolveTemplateOrganizationId(
  email: string,
  request?: Request,
): Promise<string> {
  const organizationId = request
    ? await resolveActiveOrganizationIdFromRequest(email, request)
    : await resolveActiveOrganizationId(email);

  await requireOrganizationAccess(email, organizationId);
  return organizationId;
}

export async function requireTemplateManager():
  Promise<{ actor: TemplateApiActor } | { response: NextResponse }> {
  const user = await currentUser();

  if (!user) {
    return {
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  const email = user.primaryEmailAddress?.emailAddress ?? "";

  if (!isTemplateManager(email)) {
    return {
      response: NextResponse.json(
        {
          error:
            "Access denied. Only legal users can manage contract templates.",
        },
        { status: 403 },
      ),
    };
  }

  return {
    actor: {
      user,
      email,
      actorName: getUserDisplayName(user),
    },
  };
}

export async function requireTemplateDocumentAccess():
  Promise<{ actor: TemplateApiActor } | { response: NextResponse }> {
  const user = await currentUser();

  if (!user) {
    return {
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  const email = user.primaryEmailAddress?.emailAddress ?? "";

  if (!isTemplateManager(email)) {
    return {
      response: NextResponse.json(
        {
          error:
            "Template documents can only be downloaded by legal users.",
        },
        { status: 403 },
      ),
    };
  }

  return {
    actor: {
      user,
      email,
      actorName: getUserDisplayName(user),
    },
  };
}
