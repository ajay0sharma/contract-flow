import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  getAccessibleOrganizationIds,
  listAccessibleOrganizations,
  requireOrganizationAccess,
  type AccessibleOrganization,
} from "@/lib/organization-membership";
import { getAllowedOrganizationIds } from "@/lib/clause-library-org";
import { DEFAULT_ORGANIZATION_ID } from "@/types/clause-library";

export const ACTIVE_ORGANIZATION_COOKIE = "cf-active-organization-id";

export async function getActiveOrganizationCookie(): Promise<string | null> {
  const cookieStore = await cookies();
  return cookieStore.get(ACTIVE_ORGANIZATION_COOKIE)?.value?.trim() ?? null;
}

export async function resolveActiveOrganizationId(
  email: string,
  requested?: string | null,
): Promise<string> {
  const accessibleOrganizations = await listAccessibleOrganizations(email);
  const accessibleIds = new Set(
    accessibleOrganizations.map((organization) => organization.id),
  );
  const normalizedRequested = requested?.trim();

  if (normalizedRequested && accessibleIds.has(normalizedRequested)) {
    return normalizedRequested;
  }

  const cookieOrganizationId = await getActiveOrganizationCookie();

  if (cookieOrganizationId && accessibleIds.has(cookieOrganizationId)) {
    return cookieOrganizationId;
  }

  const defaultOrganization = accessibleOrganizations.find(
    (organization) => organization.isDefault,
  );

  if (defaultOrganization) {
    return defaultOrganization.id;
  }

  if (accessibleOrganizations[0]) {
    return accessibleOrganizations[0].id;
  }

  const fallbackAllowed = getAllowedOrganizationIds();

  if (fallbackAllowed.includes(DEFAULT_ORGANIZATION_ID)) {
    return DEFAULT_ORGANIZATION_ID;
  }

  throw new Error("No accessible client organization found for this account.");
}

export async function resolveActiveOrganizationIdFromRequest(
  email: string,
  request: Request,
): Promise<string> {
  const url = new URL(request.url);
  const requested =
    url.searchParams.get("organizationId") ?? (await getActiveOrganizationCookie());

  return resolveActiveOrganizationId(email, requested);
}

export async function resolveAdminOrganizationContext(
  email: string,
  requested?: string | null,
): Promise<{
  organizationId: string;
  organizations: AccessibleOrganization[];
}> {
  const organizations = await listAccessibleOrganizations(email);
  const organizationId = await resolveActiveOrganizationId(email, requested);

  return {
    organizationId,
    organizations,
  };
}

export async function requireAdminOrganizationId(
  email: string,
  request: Request,
): Promise<string | NextResponse> {
  try {
    const organizationId = await resolveActiveOrganizationIdFromRequest(
      email,
      request,
    );
    await requireOrganizationAccess(email, organizationId);
    return organizationId;
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

export async function getOrganizationIdsForActor(
  email: string,
): Promise<string[]> {
  const accessible = await getAccessibleOrganizationIds(email);

  if (accessible.length > 0) {
    return accessible;
  }

  return getAllowedOrganizationIds();
}
