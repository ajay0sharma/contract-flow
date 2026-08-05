export function adminOrganizationQuery(organizationId: string): string {
  return `organizationId=${encodeURIComponent(organizationId)}`;
}

export function withAdminOrganizationQuery(
  path: string,
  organizationId: string,
): string {
  const separator = path.includes("?") ? "&" : "?";
  return `${path}${separator}${adminOrganizationQuery(organizationId)}`;
}
