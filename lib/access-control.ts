import { getAdminEmails } from "@/lib/platform-config";
import { getPlatformUser, getPlatformUsers } from "@/lib/user-store";
import { getWorkflowConfig } from "@/lib/workflow-store";

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export type UserRole = "admin" | "legal" | "support" | "business";

export interface LegalAssignableUser {
  email: string;
  name: string;
}

export function isAdminEmail(email: string): boolean {
  const normalized = normalizeEmail(email);

  if (
    getAdminEmails().some((adminEmail) => normalizeEmail(adminEmail) === normalized)
  ) {
    return true;
  }

  return getPlatformUser(email)?.role === "admin";
}

/** Workflow, user, and permission management is limited to administrators. */
export function canManagePlatformSettings(email: string): boolean {
  return isAdminEmail(email);
}

export function isLegalEmail(email: string): boolean {
  if (isAdminEmail(email)) {
    return true;
  }

  const normalized = normalizeEmail(email);
  const legalStep = getWorkflowConfig().steps.find((step) => step.id === "legal");

  if (
    legalStep &&
    normalizeEmail(legalStep.assigneeEmail) === normalized
  ) {
    return true;
  }

  return getPlatformUser(email)?.role === "legal";
}

export function isSupportEmail(email: string): boolean {
  if (isAdminEmail(email) || isLegalEmail(email)) {
    return false;
  }

  return getPlatformUser(email)?.role === "support";
}

export function canViewAllContractRecords(email: string): boolean {
  return isAdminEmail(email) || isLegalEmail(email) || isSupportEmail(email);
}

export function canManageContractDocuments(email: string): boolean {
  return canViewAllContractRecords(email);
}

export function getUserRole(email: string): UserRole {
  if (isAdminEmail(email)) {
    return "admin";
  }

  if (isLegalEmail(email)) {
    return "legal";
  }

  if (isSupportEmail(email)) {
    return "support";
  }

  return "business";
}

export function getHomePathForEmail(email: string): string {
  const role = getUserRole(email);

  if (role === "admin") {
    return "/admin/dashboard";
  }

  if (role === "legal") {
    return "/legal/dashboard";
  }

  return "/dashboard";
}

export function getLegalTeamEmails(): string[] {
  return getLegalAssignableUsers().map((user) => user.email);
}

export function getLegalAssignableUsers(): LegalAssignableUser[] {
  const usersByEmail = new Map<string, LegalAssignableUser>();
  const legalStep = getWorkflowConfig().steps.find((step) => step.id === "legal");

  function addUser(email: string, name?: string): void {
    const normalized = normalizeEmail(email);

    if (!normalized || usersByEmail.has(normalized)) {
      return;
    }

    usersByEmail.set(normalized, {
      email,
      name: name?.trim() || email,
    });
  }

  for (const user of getPlatformUsers()) {
    if (user.role === "legal" || user.role === "admin") {
      addUser(user.email, user.name);
    }
  }

  if (legalStep) {
    addUser(legalStep.assigneeEmail, legalStep.assigneeName);
  }

  for (const email of getAdminEmails()) {
    addUser(email);
  }

  return [...usersByEmail.values()].sort((a, b) =>
    a.name.localeCompare(b.name),
  );
}
