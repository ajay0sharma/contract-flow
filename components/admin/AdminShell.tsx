import { OrganizationSwitcher } from "@/components/admin/OrganizationSwitcher";
import type { AccessibleOrganization } from "@/lib/organization-membership";

interface AdminShellProps {
  title: string;
  description?: string;
  organizations?: AccessibleOrganization[];
  activeOrganizationId?: string;
  children: React.ReactNode;
}

export function AdminShell({
  title,
  description,
  organizations,
  activeOrganizationId,
  children,
}: AdminShellProps) {
  const activeOrganization =
    organizations?.find((organization) => organization.id === activeOrganizationId) ??
    organizations?.[0];

  const resolvedDescription =
    description ??
    (activeOrganization
      ? `Managing ${activeOrganization.name}`
      : undefined);

  return (
    <div className="mx-auto w-full max-w-7xl px-6 py-8">
      <header className="mb-6 flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">{title}</h1>
          {resolvedDescription ? (
            <p className="mt-1 text-sm text-gray-500">{resolvedDescription}</p>
          ) : null}
        </div>
        {organizations && activeOrganizationId ? (
          <OrganizationSwitcher
            organizations={organizations}
            activeOrganizationId={activeOrganizationId}
          />
        ) : null}
      </header>
      <main>{children}</main>
    </div>
  );
}
