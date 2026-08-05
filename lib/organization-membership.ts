import { getAvailableCompanyConfigs } from "@/lib/company-config";
import { getAdminEmails } from "@/lib/platform-config";
import { getPlatformUser } from "@/lib/platform-user-read";
import { allowMemoryPersistence } from "@/lib/persistence-mode";
import { getPrismaClient } from "@/lib/prisma";
import { DEFAULT_ORGANIZATION_ID } from "@/types/clause-library";

export type OrganizationRole = "admin" | "legal" | "business" | "support";

export interface AccessibleOrganization {
  id: string;
  name: string;
  role: OrganizationRole;
  isDefault: boolean;
}

export interface OrganizationMembershipRecord {
  organizationId: string;
  userEmail: string;
  role: OrganizationRole;
  isDefault: boolean;
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function isAdminEmail(email: string): boolean {
  const normalized = normalizeEmail(email);

  if (
    getAdminEmails().some(
      (adminEmail) => normalizeEmail(adminEmail) === normalized,
    )
  ) {
    return true;
  }

  return getPlatformUser(email)?.role === "admin";
}

const memoryMemberships: OrganizationMembershipRecord[] = [
  {
    organizationId: "default",
    userEmail: "as.ops.consulting@gmail.com",
    role: "admin",
    isDefault: true,
  },
  {
    organizationId: "acme",
    userEmail: "as.ops.consulting@gmail.com",
    role: "admin",
    isDefault: false,
  },
  {
    organizationId: "default",
    userEmail: "ajay.sharma.jd@gmail.com",
    role: "legal",
    isDefault: true,
  },
  {
    organizationId: "default",
    userEmail: "support@example.com",
    role: "support",
    isDefault: true,
  },
  {
    organizationId: "default",
    userEmail: "marcus@example.com",
    role: "business",
    isDefault: true,
  },
  {
    organizationId: "default",
    userEmail: "elena@example.com",
    role: "business",
    isDefault: true,
  },
  {
    organizationId: "default",
    userEmail: "jordan@example.com",
    role: "business",
    isDefault: true,
  },
];

function getMemoryAccessibleOrganizations(
  email: string,
): AccessibleOrganization[] {
  const normalized = normalizeEmail(email);

  if (isAdminEmail(email)) {
    return getAvailableCompanyConfigs().map((config, index) => ({
      id: config.id,
      name: config.name,
      role: "admin" as const,
      isDefault: index === 0,
    }));
  }

  return memoryMemberships
    .filter((membership) => normalizeEmail(membership.userEmail) === normalized)
    .map((membership) => {
      const config = getAvailableCompanyConfigs().find(
        (entry) => entry.id === membership.organizationId,
      );

      return {
        id: membership.organizationId,
        name: config?.name ?? membership.organizationId,
        role: membership.role,
        isDefault: membership.isDefault,
      };
    });
}

export async function listAccessibleOrganizations(
  email: string,
): Promise<AccessibleOrganization[]> {
  if (allowMemoryPersistence()) {
    return getMemoryAccessibleOrganizations(email);
  }

  try {
    const normalized = normalizeEmail(email);

    if (isAdminEmail(email)) {
      const prisma = getPrismaClient();
      const organizations = await prisma.organization.findMany({
        where: { status: "active" },
        orderBy: { name: "asc" },
      });

      return organizations.map((organization, index) => ({
        id: organization.id,
        name: organization.name,
        role: "admin" as const,
        isDefault: organization.id === DEFAULT_ORGANIZATION_ID || index === 0,
      }));
    }

    const prisma = getPrismaClient();
    const memberships = await prisma.organizationMembership.findMany({
      where: {
        userEmail: {
          equals: normalized,
          mode: "insensitive",
        },
        organization: {
          status: "active",
        },
      },
      include: {
        organization: true,
      },
      orderBy: [{ isDefault: "desc" }, { organization: { name: "asc" } }],
    });

    return memberships.map((membership) => ({
      id: membership.organizationId,
      name: membership.organization.name,
      role: membership.role as OrganizationRole,
      isDefault: membership.isDefault,
    }));
  } catch {
    return getMemoryAccessibleOrganizations(email);
  }
}

export async function getAccessibleOrganizationIds(
  email: string,
): Promise<string[]> {
  const organizations = await listAccessibleOrganizations(email);
  return organizations.map((organization) => organization.id);
}

export async function userHasOrganizationAccess(
  email: string,
  organizationId: string,
): Promise<boolean> {
  const accessibleIds = await getAccessibleOrganizationIds(email);
  return accessibleIds.includes(organizationId);
}

export async function requireOrganizationAccess(
  email: string,
  organizationId: string,
): Promise<void> {
  const allowed = await userHasOrganizationAccess(email, organizationId);

  if (!allowed) {
    throw new Error("You do not have access to this client organization.");
  }
}
