import { clerkClient } from "@clerk/nextjs/server";
import { listContractTypes } from "@/lib/contract-type-store";
import { ensureWorkflowPolicyLoaded } from "@/lib/workflow-policy-server";
import { getPlatformUsers } from "@/lib/user-store";
import type { PlatformRole } from "@/lib/platform-config";
import type { ContractTypeRecord } from "@/types/contract-template";
import type { WorkflowPolicy } from "@/lib/workflow-config-types";

export interface AdminDashboardUserRow {
  id: string;
  email: string;
  name: string;
  role: PlatformRole;
  createdAt: string;
}

export interface AdminDashboardData {
  policy: WorkflowPolicy;
  contractTypes: ContractTypeRecord[];
  users: AdminDashboardUserRow[];
  loadErrors: string[];
}

export async function loadAdminDashboardData(
  organizationId: string,
): Promise<AdminDashboardData> {
  const loadErrors: string[] = [];

  let contractTypes: ContractTypeRecord[] = [];

  try {
    contractTypes = await listContractTypes(organizationId, {
      includeInactive: true,
    });
  } catch {
    loadErrors.push(
      "Contract types could not be loaded. Run database migrations and refresh.",
    );
  }

  let users: AdminDashboardUserRow[] = [];

  try {
    const client = await clerkClient();
    const response = await client.users.getUserList({ limit: 100 });
    const platformUsers = getPlatformUsers();

    users = response.data.map((user) => {
      const email = user.primaryEmailAddress?.emailAddress ?? "";
      const platformUser = platformUsers.find(
        (entry) => entry.email.toLowerCase() === email.toLowerCase(),
      );

      return {
        id: user.id,
        email,
        name: user.fullName ?? email,
        role: (platformUser?.role ?? "business") as PlatformRole,
        createdAt: new Date(user.createdAt).toISOString(),
      };
    });
  } catch {
    loadErrors.push("User list could not be loaded from Clerk.");
  }

  return {
    policy: await ensureWorkflowPolicyLoaded(organizationId),
    contractTypes,
    users,
    loadErrors,
  };
}
