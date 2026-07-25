"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { updateUserRoleAction } from "@/app/actions/admin";
import type { PlatformRole } from "@/lib/platform-config";

export interface AdminUserRow {
  id: string;
  email: string;
  name: string;
  role: PlatformRole;
  createdAt: string;
}

interface UserRoleTableProps {
  users: AdminUserRow[];
}

const roleOptions: PlatformRole[] = ["business", "support", "legal", "admin"];

const roleLabels: Record<PlatformRole, string> = {
  business: "General user",
  support: "Support user",
  legal: "Legal user",
  admin: "Admin",
};

export function UserRoleTable({ users }: UserRoleTableProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleRoleChange(email: string, role: PlatformRole) {
    setError(null);

    startTransition(async () => {
      try {
        await updateUserRoleAction(email, role);
        router.refresh();
      } catch (submitError) {
        setError(
          submitError instanceof Error
            ? submitError.message
            : "Unable to update user role.",
        );
      }
    });
  }

  return (
    <section className="rounded-lg border border-stone-200 bg-white shadow-sm">
      <div className="border-b border-stone-200 px-6 py-4">
        <h2 className="text-base font-semibold text-stone-900">Platform users</h2>
        <p className="mt-1 text-sm text-stone-600">
          Assign each account to one of four tiers: general user, support user,
          legal user, or admin.
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-stone-200 bg-stone-50 text-stone-600">
            <tr>
              <th className="px-6 py-3 font-medium">Name</th>
              <th className="px-6 py-3 font-medium">Email</th>
              <th className="px-6 py-3 font-medium">Role</th>
              <th className="px-6 py-3 font-medium">Created</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id} className="border-b border-stone-100">
                <td className="px-6 py-4 font-medium text-stone-900">
                  {user.name}
                </td>
                <td className="px-6 py-4 text-stone-700">{user.email}</td>
                <td className="px-6 py-4">
                  <select
                    value={user.role}
                    disabled={isPending}
                    onChange={(event) =>
                      handleRoleChange(
                        user.email,
                        event.target.value as PlatformRole,
                      )
                    }
                    className="rounded-md border border-stone-300 px-2 py-1 text-stone-900"
                  >
                    {roleOptions.map((role) => (
                      <option key={role} value={role}>
                        {roleLabels[role]}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-6 py-4 text-stone-600">
                  {user.createdAt.slice(0, 10)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {error ? (
        <p className="border-t border-red-100 bg-red-50 px-6 py-3 text-sm text-red-800">
          {error}
        </p>
      ) : null}
    </section>
  );
}
