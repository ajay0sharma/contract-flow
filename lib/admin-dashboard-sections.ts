export const ADMIN_DASHBOARD_SECTIONS = [
  "submitted-contracts",
  "contract-types",
  "workflow-settings",
  "workflow-policies",
  "user-settings",
] as const;

export type AdminDashboardSection =
  (typeof ADMIN_DASHBOARD_SECTIONS)[number];

export function isAdminDashboardSection(
  value: string | null | undefined,
): value is AdminDashboardSection {
  if (!value) {
    return false;
  }

  return ADMIN_DASHBOARD_SECTIONS.includes(value as AdminDashboardSection);
}

export function adminDashboardSectionHref(
  section: AdminDashboardSection,
): string {
  return `/admin/dashboard?section=${section}`;
}
