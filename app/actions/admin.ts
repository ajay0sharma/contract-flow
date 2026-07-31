"use server";

import { clerkClient, currentUser } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { isAdminEmail } from "@/lib/access-control";
import { getHomePathForEmail } from "@/lib/legal-access";
import type { PlatformRole } from "@/lib/platform-config";
import {
  upsertPlatformUser,
  updatePlatformUserRole,
} from "@/lib/user-store";
import { updateWorkflowPolicy } from "@/lib/policy-store";
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
