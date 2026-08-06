import Link from "next/link";
import { AdminShell } from "@/components/admin/AdminShell";
import { NavIcon } from "@/components/layout/NavIcon";
import { requireAdminOrganizationPageContext } from "@/lib/admin-organization-page";
import { getDirectoryConfig } from "@/lib/directory-sync";
import { getOrganizationEmailConfig } from "@/lib/organization-email-config";
import { getPoConfig } from "@/lib/po-integration";
import { getSignatureIntegrationConfig } from "@/lib/signature-integration";

export default async function AdminIntegrationsPage() {
  const { organizationId, organizations } =
    await requireAdminOrganizationPageContext();
  const [poConfig, directoryConfig, emailConfig, signatureConfig] =
    await Promise.all([
    getPoConfig(organizationId),
    getDirectoryConfig(organizationId),
    getOrganizationEmailConfig(organizationId),
    getSignatureIntegrationConfig(organizationId),
  ]);

  const emailConfigured =
    emailConfig.mailboxEmails.length > 0 ||
    Boolean(emailConfig.outboundWebhookUrl) ||
    emailConfig.hasWebhookSecret;

  const integrations = [
    {
      title: "Email integration",
      description: "Configure inbound and outbound contract email for this client",
      href: "/admin/email",
      icon: "mail" as const,
      connected: emailConfigured,
    },
    {
      title: "User directory",
      description: "Sync Microsoft 365 or Google Workspace users",
      href: "/admin/directory",
      icon: "users-group" as const,
      connected: Boolean(directoryConfig?.isEnabled),
    },
    {
      title: "E-signature integration",
      description: "Send approved contracts for client e-signature",
      href: "/admin/signature",
      icon: "shield-lock" as const,
      connected: Boolean(signatureConfig.isEnabled),
    },
    {
      title: "Purchase order integration",
      description: "Connect Coupa, SAP, Prendio or other PO systems",
      href: "/settings/po-integration",
      icon: "plug" as const,
      connected: Boolean(poConfig?.isEnabled),
    },
  ];

  return (
    <AdminShell
      title="Integrations"
      description="Connect external systems used by your contract workflow."
      organizations={organizations}
      activeOrganizationId={organizationId}
    >
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {integrations.map((integration) => (
          <Link
            key={integration.href}
            href={integration.href}
            className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm transition hover:border-gray-200"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <span className="rounded-xl bg-[#F0E8D8] p-2 text-[#8C6A35]">
                  <NavIcon name={integration.icon} className="h-5 w-5" />
                </span>
                <div>
                  <h2 className="text-base font-semibold text-gray-900">
                    {integration.title}
                  </h2>
                  <p className="mt-1 text-sm text-gray-500">
                    {integration.description}
                  </p>
                </div>
              </div>
              <span
                className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${
                  integration.connected
                    ? "bg-green-50 text-green-700"
                    : "bg-gray-100 text-gray-600"
                }`}
              >
                {integration.connected ? "Connected" : "Not configured"}
              </span>
            </div>
          </Link>
        ))}
      </div>
    </AdminShell>
  );
}
