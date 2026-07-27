import Link from "next/link";
import { Suspense } from "react";
import { AdminShell } from "@/components/admin/AdminShell";
import { AdminDashboardScrollManager } from "@/components/admin/AdminDashboardScrollManager";
import { AdminSubmittedContractsTable } from "@/components/admin/AdminSubmittedContractsTable";
import { ContractTypesAdminForm } from "@/components/admin/ContractTypesAdminForm";
import { CreateUserForm } from "@/components/admin/CreateUserForm";
import { UserRoleTable } from "@/components/admin/UserRoleTable";
import { WorkflowConfigForm } from "@/components/admin/WorkflowConfigForm";
import { WorkflowPolicyForm } from "@/components/admin/WorkflowPolicyForm";
import {
  requireAdminPage,
} from "@/app/actions/admin";
import { adminDashboardSectionHref } from "@/lib/admin-dashboard-sections";
import { loadAdminDashboardData } from "@/lib/admin-dashboard-data";
import { getAllContracts } from "@/lib/contract-store";
import { getPlatformUsers } from "@/lib/user-store";
import { getWorkflowConfig } from "@/lib/workflow-store";
import { isAwaitingApproval } from "@/lib/workflow-engine";

export default async function AdminDashboardPage() {
  const user = await requireAdminPage();
  const displayName =
    user.fullName ?? user.firstName ?? user.username ?? "Administrator";

  const contracts = getAllContracts();
  const pendingApprovals = contracts.filter((contract) =>
    isAwaitingApproval(contract),
  ).length;
  const platformUsers = getPlatformUsers();
  const workflow = getWorkflowConfig();
  const { policy, contractTypes, users, loadErrors } =
    await loadAdminDashboardData();

  const cards = [
    {
      title: "Submitted contracts",
      value: contracts.length.toString(),
      href: adminDashboardSectionHref("submitted-contracts"),
      detail: "All intake records",
    },
    {
      title: "Pending approvals",
      value: pendingApprovals.toString(),
      href: adminDashboardSectionHref("submitted-contracts"),
      detail: "Records currently in workflow",
    },
    {
      title: "Platform users",
      value: platformUsers.length.toString(),
      href: adminDashboardSectionHref("user-settings"),
      detail: "Manage users and roles",
    },
    {
      title: "Contract types",
      value: contractTypes.filter((type) => type.isActive).length.toString(),
      href: adminDashboardSectionHref("contract-types"),
      detail: "Parent and child agreement setup",
    },
    {
      title: "Workflow steps",
      value: workflow.steps.length.toString(),
      href: adminDashboardSectionHref("workflow-settings"),
      detail: "Edit approval chain",
    },
  ];

  return (
    <AdminShell
      title="Admin dashboard"
      description="Default organization"
    >
      <Suspense fallback={null}>
        <AdminDashboardScrollManager />
      </Suspense>
      {loadErrors.length > 0 ? (
        <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {loadErrors.map((message) => (
            <p key={message}>{message}</p>
          ))}
        </div>
      ) : null}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {cards.map((card) => (
          <Link
            key={card.title}
            href={card.href}
            className="flex flex-col gap-2 rounded-2xl border border-gray-100 bg-white p-6 shadow-sm transition hover:border-gray-200"
          >
            <p className="text-sm text-gray-500">{card.title}</p>
            <p className="text-3xl font-light text-gray-900">{card.value}</p>
            <p className="text-xs text-gray-400">{card.detail}</p>
          </Link>
        ))}
      </div>

      <section className="mt-8 rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
        <h2 className="text-base font-semibold text-stone-900">
          Administrator controls
        </h2>
        <p className="mt-2 text-sm text-stone-600">
          Configure lifecycle routing, set approval policies, and provision
          users as general users, legal users, or administrators.
        </p>
        <ul className="mt-4 grid gap-3 md:grid-cols-3">
          <li>
            <Link
              href={adminDashboardSectionHref("contract-types")}
              className="block rounded-md border border-stone-200 px-4 py-3 text-sm font-medium text-stone-900 hover:bg-stone-50"
            >
              Manage contract types
            </Link>
          </li>
          <li>
            <Link
              href={adminDashboardSectionHref("workflow-settings")}
              className="block rounded-md border border-stone-200 px-4 py-3 text-sm font-medium text-stone-900 hover:bg-stone-50"
            >
              Create or modify workflow settings
            </Link>
          </li>
          <li>
            <Link
              href={adminDashboardSectionHref("workflow-policies")}
              className="block rounded-md border border-stone-200 px-4 py-3 text-sm font-medium text-stone-900 hover:bg-stone-50"
            >
              Configure workflow policies
            </Link>
          </li>
          <li>
            <Link
              href={adminDashboardSectionHref("user-settings")}
              className="block rounded-md border border-stone-200 px-4 py-3 text-sm font-medium text-stone-900 hover:bg-stone-50"
            >
              Establish user tiers
            </Link>
          </li>
          <li>
            <Link
              href="/settings/po-integration"
              className="block rounded-md border border-stone-200 px-4 py-3 text-sm font-medium text-stone-900 hover:bg-stone-50"
            >
              Configure PO integration
            </Link>
          </li>
        </ul>
      </section>

      <section id="submitted-contracts" className="mt-10 scroll-mt-20">
        <div className="mb-4">
          <h2 className="text-lg font-semibold text-stone-900">
            All submitted contracts
          </h2>
          <p className="mt-1 text-sm text-stone-600">
            Admin visibility across every intake record, regardless of requester,
            legal owner, or current workflow stage.
          </p>
        </div>
        <AdminSubmittedContractsTable contracts={contracts} />
      </section>

      <section id="contract-types" className="mt-10 scroll-mt-20">
        <div className="mb-4">
          <h2 className="text-lg font-semibold text-stone-900">
            Contract types
          </h2>
          <p className="mt-1 text-sm text-stone-600">
            Add or remove agreement types and configure whether each type can
            serve as a parent agreement or must link to an existing parent
            during intake.
          </p>
        </div>
        <ContractTypesAdminForm initialTypes={contractTypes} />
      </section>

      <section id="workflow-settings" className="mt-10 scroll-mt-20">
        <div className="mb-4">
          <h2 className="text-lg font-semibold text-stone-900">
            Workflow settings
          </h2>
          <p className="mt-1 text-sm text-stone-600">
            Create or modify the approval chain, reviewer assignees, and routing
            thresholds from the admin dashboard.
          </p>
        </div>
        <WorkflowConfigForm initialConfig={workflow} />
      </section>

      <section id="workflow-policies" className="mt-10 scroll-mt-20">
        <div className="mb-4">
          <h2 className="text-lg font-semibold text-stone-900">
            Workflow policies
          </h2>
          <p className="mt-1 text-sm text-stone-600">
            Change platform policy settings that apply across all submitted
            contracts.
          </p>
        </div>
        <WorkflowPolicyForm initialPolicy={policy} />
      </section>

      <section id="user-settings" className="mt-10 scroll-mt-20">
        <div className="mb-4">
          <h2 className="text-lg font-semibold text-stone-900">
            User settings
          </h2>
          <p className="mt-1 text-sm text-stone-600">
            Establish and adjust user tiers for general users, legal users, and
            admins.
          </p>
        </div>
        <div className="space-y-8">
          <CreateUserForm />
          <UserRoleTable users={users} />
        </div>
      </section>
    </AdminShell>
  );
}
