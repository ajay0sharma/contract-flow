"use server";

import { clerkClient, currentUser } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { isAdminEmail } from "@/lib/access-control";
import { getHomePathForEmail } from "@/lib/legal-access";
import type { PlatformRole } from "@/lib/platform-config";
import {
  getPlatformUsers,
  upsertPlatformUser,
  updatePlatformUserRole,
} from "@/lib/user-store";
import { resolveClauseLibraryOrganizationId } from "@/lib/clause-library-org";
import {
  createContractType,
  deleteContractType,
  updateContractType,
} from "@/lib/contract-type-store";
import { updateWorkflowPolicy, getWorkflowPolicy } from "@/lib/policy-store";
import type { WorkflowConfig, WorkflowPolicy } from "@/lib/workflow-config-types";
import { updateWorkflowConfig } from "@/lib/workflow-store";

async function requireAdmin() {
  const user = await currentUser();

  if (!user) {
    throw new Error("You must be signed in.");
  }

  const email = user.primaryEmailAddress?.emailAddress ?? "";

  if (!isAdminEmail(email)) {
    throw new Error("Administrator permissions required.");
  }

  return {
    email,
    name:
      user.fullName ??
      [user.firstName, user.lastName].filter(Boolean).join(" ") ??
      "Administrator",
  };
}

export async function saveWorkflowConfigAction(config: WorkflowConfig) {
  await requireAdmin();
  updateWorkflowConfig(config);

  revalidatePath("/admin/dashboard");
  revalidatePath("/admin/workflow");
  revalidatePath("/admin/policies");
  revalidatePath("/settings/workflow");
  revalidatePath("/legal/dashboard");
  revalidatePath("/dashboard");
}

export async function saveWorkflowPolicyAction(policy: WorkflowPolicy) {
  await requireAdmin();
  updateWorkflowPolicy(policy);

  revalidatePath("/admin/dashboard");
  revalidatePath("/admin/policies");
  revalidatePath("/settings/workflow");
}

export async function createPlatformUserAction(input: {
  email: string;
  firstName: string;
  lastName: string;
  password: string;
  role: PlatformRole;
}) {
  await requireAdmin();

  const client = await clerkClient();
  const createdUser = await client.users.createUser({
    emailAddress: [input.email],
    password: input.password,
    firstName: input.firstName,
    lastName: input.lastName,
  });

  upsertPlatformUser({
    email: input.email,
    name: `${input.firstName} ${input.lastName}`.trim(),
    role: input.role,
    createdAt: new Date().toISOString(),
  });

  revalidatePath("/admin/dashboard");
  revalidatePath("/admin/users");

  return {
    id: createdUser.id,
    email: input.email,
  };
}

export async function updateUserRoleAction(email: string, role: PlatformRole) {
  await requireAdmin();
  updatePlatformUserRole(email, role);
  revalidatePath("/admin/dashboard");
  revalidatePath("/admin/users");
}

export async function listClerkUsersAction() {
  await requireAdmin();

  const client = await clerkClient();
  const response = await client.users.getUserList({ limit: 100 });

  const platformUsers = getPlatformUsers();

  return response.data.map((user) => {
    const email = user.primaryEmailAddress?.emailAddress ?? "";
    const platformUser = platformUsers.find(
      (entry) => entry.email.toLowerCase() === email.toLowerCase(),
    );

    return {
      id: user.id,
      email,
      name: user.fullName ?? email,
      role: platformUser?.role ?? "business",
      createdAt: new Date(user.createdAt).toISOString(),
    };
  });
}

export async function requireAdminPage() {
  const user = await currentUser();

  if (!user) {
    redirect("/login");
  }

  const email = user.primaryEmailAddress?.emailAddress ?? "";

  if (!isAdminEmail(email)) {
    redirect(getHomePathForEmail(email));
  }

  return user;
}

export async function getAdminPolicyAction() {
  await requireAdmin();
  return getWorkflowPolicy();
}

export async function createAdminContractTypeAction(input: {
  label: string;
  description?: string | null;
  canBeParentAgreement?: boolean;
  requiresParentAgreement?: boolean;
}) {
  const admin = await requireAdmin();
  const organizationId = resolveClauseLibraryOrganizationId();
  const result = await createContractType({
    organizationId,
    label: input.label,
    description: input.description,
    createdById: admin.email,
    canBeParentAgreement: input.canBeParentAgreement ?? false,
    requiresParentAgreement: input.requiresParentAgreement ?? false,
  });

  if (result.error || !result.type) {
    throw new Error(result.error ?? "Unable to create contract type.");
  }

  revalidatePath("/admin/dashboard");
  revalidatePath("/legal/dashboard");
  revalidatePath("/contracts/new");

  return result.type;
}

export async function updateAdminContractTypeAction(input: {
  id: string;
  canBeParentAgreement?: boolean;
  requiresParentAgreement?: boolean;
  label?: string;
  description?: string | null;
}) {
  await requireAdmin();
  const organizationId = resolveClauseLibraryOrganizationId();
  const result = await updateContractType(input.id, organizationId, {
    label: input.label,
    description: input.description,
    canBeParentAgreement: input.canBeParentAgreement,
    requiresParentAgreement: input.requiresParentAgreement,
  });

  if (result.error || !result.type) {
    throw new Error(result.error ?? "Unable to update contract type.");
  }

  revalidatePath("/admin/dashboard");
  revalidatePath("/legal/dashboard");
  revalidatePath("/contracts/new");

  return result.type;
}

export async function deleteAdminContractTypeAction(id: string) {
  await requireAdmin();
  const organizationId = resolveClauseLibraryOrganizationId();
  const result = await deleteContractType(id, organizationId);

  if (result.error) {
    throw new Error(result.error);
  }

  revalidatePath("/admin/dashboard");
  revalidatePath("/legal/dashboard");
  revalidatePath("/contracts/new");

  return {
    deleted: result.deleted ?? false,
    type: result.type ?? null,
  };
}
