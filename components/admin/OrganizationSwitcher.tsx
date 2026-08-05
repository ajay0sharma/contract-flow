"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { AccessibleOrganization } from "@/lib/organization-membership";

interface OrganizationSwitcherProps {
  organizations: AccessibleOrganization[];
  activeOrganizationId: string;
}

export function OrganizationSwitcher({
  organizations,
  activeOrganizationId,
}: OrganizationSwitcherProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (organizations.length <= 1) {
    const activeOrganization =
      organizations.find((organization) => organization.id === activeOrganizationId) ??
      organizations[0];

    if (!activeOrganization) {
      return null;
    }

    return (
      <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700">
        Client: <span className="font-medium text-gray-900">{activeOrganization.name}</span>
      </div>
    );
  }

  async function handleChange(nextOrganizationId: string) {
    if (nextOrganizationId === activeOrganizationId) {
      return;
    }

    setError(null);

    startTransition(async () => {
      try {
        const response = await fetch("/api/admin/active-organization", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ organizationId: nextOrganizationId }),
        });

        if (!response.ok) {
          const payload = (await response.json().catch(() => null)) as
            | { error?: string }
            | null;
          throw new Error(payload?.error ?? "Unable to switch client organization.");
        }

        router.refresh();
      } catch (switchError) {
        setError(
          switchError instanceof Error
            ? switchError.message
            : "Unable to switch client organization.",
        );
      }
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <label className="flex items-center gap-2 text-sm text-gray-600">
        <span className="whitespace-nowrap">Active client</span>
        <select
          value={activeOrganizationId}
          disabled={isPending}
          onChange={(event) => {
            void handleChange(event.target.value);
          }}
          className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-900 shadow-sm focus:border-[#3558A0] focus:outline-none focus:ring-2 focus:ring-[#3558A0]/20 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {organizations.map((organization) => (
            <option key={organization.id} value={organization.id}>
              {organization.name}
            </option>
          ))}
        </select>
      </label>
      {error ? <p className="text-xs text-red-600">{error}</p> : null}
    </div>
  );
}
