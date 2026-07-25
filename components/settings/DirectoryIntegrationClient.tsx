"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { DirectoryProvider } from "@/lib/generated/prisma/enums";
import type { DirectoryUserData } from "@/lib/directory-types";

type PublicDirectoryConfig = {
  provider: DirectoryProvider;
  isEnabled: boolean;
  displayName: string;
  lastSyncAt: string | null;
  lastSyncStatus: string;
  lastSyncCount: number | null;
  lastSyncError: string | null;
  autoSyncEnabled: boolean;
  autoSyncIntervalHours: number;
  scopeFilter: unknown;
};

type DirectoryConfigResponse =
  | ({ configured: false } & Partial<PublicDirectoryConfig>)
  | PublicDirectoryConfig;

type DirectoryUserRecord = {
  id: string;
  email: string;
  displayName: string;
  jobTitle: string | null;
  department: string | null;
  isActive: boolean;
};

type TestResult = {
  success: boolean;
  userCount: number;
  sampleUsers: DirectoryUserData[];
  error: string | null;
};

type SaveProgress = "idle" | "saving" | "syncing" | "complete";

const SUGGESTED_APP_NAME = "Your Company Contract System";
const SYNC_INTERVAL_OPTIONS = [
  { label: "Every 24 hours (recommended)", value: 24 },
  { label: "Every 12 hours", value: 12 },
  { label: "Every 6 hours", value: 6 },
  { label: "Weekly", value: 168 },
] as const;

function isConfigured(
  config: DirectoryConfigResponse | null,
): config is PublicDirectoryConfig {
  return Boolean(config && !("configured" in config && config.configured === false));
}

function formatRelativeTime(isoTimestamp: string): string {
  const diffMs = Date.now() - new Date(isoTimestamp).getTime();
  const minutes = Math.floor(diffMs / 60_000);

  if (minutes < 1) {
    return "just now";
  }

  if (minutes < 60) {
    return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  }

  const hours = Math.floor(minutes / 60);

  if (hours < 48) {
    return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  }

  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

function parseScopeFilter(value: unknown): {
  domain: string;
  departments: string[];
} {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { domain: "", departments: [] };
  }

  const filter = value as Record<string, unknown>;

  return {
    domain: typeof filter.domain === "string" ? filter.domain : "",
    departments: Array.isArray(filter.departments)
      ? filter.departments.map((entry) => String(entry))
      : [],
  };
}

function getTroubleshootingTip(
  provider: DirectoryProvider,
  error: string,
): string | null {
  const message = error.toLowerCase();

  if (
    message.includes("credential") ||
    message.includes("client") ||
    message.includes("secret") ||
    message.includes("tenant")
  ) {
    return provider === "microsoft"
      ? "Check your Client ID, Tenant ID, and Secret."
      : "Check your service account JSON, admin email, and domain.";
  }

  if (
    message.includes("permission") ||
    message.includes("consent") ||
    message.includes("delegation") ||
    message.includes("not authorized")
  ) {
    return provider === "microsoft"
      ? "Verify that User.Read.All permission was granted admin consent."
      : "Verify domain-wide delegation was granted in Google Workspace Admin.";
  }

  if (message.includes("not found") || message.includes("700016")) {
    return "Check that the Tenant ID matches your Azure AD directory.";
  }

  return null;
}

function buildDisplayName(
  provider: DirectoryProvider,
  domain: string,
): string {
  if (provider === "google" && domain.trim()) {
    return `${domain.trim()} Google Workspace`;
  }

  if (provider === "microsoft") {
    return "Microsoft 365 Directory";
  }

  return "Company Directory";
}

function Spinner({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg
      aria-hidden
      className={`animate-spin text-current ${className}`}
      viewBox="0 0 24 24"
      fill="none"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  );
}

function UsersOffIcon() {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="m17 11 4 4m0-4-4 4" />
    </svg>
  );
}

function UsersIcon() {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

function AlertIcon() {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="11" width="18" height="11" rx="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}

function UsersPreviewTable({
  users,
  searchQuery,
  onSearchChange,
  page,
  onPageChange,
}: {
  users: DirectoryUserRecord[];
  searchQuery: string;
  onSearchChange: (value: string) => void;
  page: number;
  onPageChange: (page: number) => void;
}) {
  const pageSize = 20;
  const filteredUsers = useMemo(() => {
    const needle = searchQuery.trim().toLowerCase();

    if (!needle) {
      return users;
    }

    return users.filter((user) =>
      [
        user.displayName,
        user.email,
        user.jobTitle ?? "",
        user.department ?? "",
      ].some((value) => value.toLowerCase().includes(needle)),
    );
  }, [searchQuery, users]);

  const totalPages = Math.max(1, Math.ceil(filteredUsers.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pageUsers = filteredUsers.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize,
  );

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h3 className="text-base font-semibold text-slate-900">
          {users.length} users in directory
        </h3>
        <input
          type="search"
          value={searchQuery}
          onChange={(event) => {
            onSearchChange(event.target.value);
            onPageChange(1);
          }}
          placeholder="Search users..."
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm sm:max-w-xs"
        />
      </div>

      <div className="mt-4 overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-3 py-2">Name</th>
              <th className="px-3 py-2">Email</th>
              <th className="px-3 py-2">Job title</th>
              <th className="px-3 py-2">Department</th>
              <th className="px-3 py-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {pageUsers.map((user) => (
              <tr key={user.id} className="border-b border-slate-100">
                <td className="px-3 py-3 font-medium text-slate-900">
                  {user.displayName}
                </td>
                <td className="px-3 py-3 text-slate-600">{user.email}</td>
                <td className="px-3 py-3 text-slate-600">
                  {user.jobTitle ?? "—"}
                </td>
                <td className="px-3 py-3 text-slate-600">
                  {user.department ?? "—"}
                </td>
                <td className="px-3 py-3">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      user.isActive
                        ? "bg-emerald-50 text-emerald-700"
                        : "bg-slate-100 text-slate-600"
                    }`}
                  >
                    {user.isActive ? "Active" : "Inactive"}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {totalPages > 1 ? (
        <div className="mt-4 flex items-center justify-between text-sm text-slate-600">
          <p>
            Page {currentPage} of {totalPages}
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={currentPage <= 1}
              onClick={() => onPageChange(currentPage - 1)}
              className="rounded-md border border-slate-300 px-3 py-1.5 disabled:opacity-50"
            >
              Previous
            </button>
            <button
              type="button"
              disabled={currentPage >= totalPages}
              onClick={() => onPageChange(currentPage + 1)}
              className="rounded-md border border-slate-300 px-3 py-1.5 disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function DirectoryIntegrationClient() {
  const [config, setConfig] = useState<DirectoryConfigResponse | null>(null);
  const [loadingConfig, setLoadingConfig] = useState(true);
  const [provider, setProvider] = useState<DirectoryProvider>("microsoft");
  const [tenantId, setTenantId] = useState("");
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [showClientSecret, setShowClientSecret] = useState(false);
  const [serviceAccountJson, setServiceAccountJson] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [workspaceDomain, setWorkspaceDomain] = useState("");
  const [scopeDomain, setScopeDomain] = useState("");
  const [departmentTags, setDepartmentTags] = useState<string[]>([]);
  const [departmentInput, setDepartmentInput] = useState("");
  const [autoSyncEnabled, setAutoSyncEnabled] = useState(true);
  const [autoSyncIntervalHours, setAutoSyncIntervalHours] = useState(24);
  const [setupExpanded, setSetupExpanded] = useState(true);
  const [scopeExpanded, setScopeExpanded] = useState(false);
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [testPending, setTestPending] = useState(false);
  const [testPassed, setTestPassed] = useState(false);
  const [saveProgress, setSaveProgress] = useState<SaveProgress>("idle");
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [syncPending, setSyncPending] = useState(false);
  const [users, setUsers] = useState<DirectoryUserRecord[]>([]);
  const [usersSearch, setUsersSearch] = useState("");
  const [usersPage, setUsersPage] = useState(1);
  const [showUsersModal, setShowUsersModal] = useState(false);
  const [copyMessage, setCopyMessage] = useState<string | null>(null);

  const configured = isConfigured(config);

  const serviceAccountLooksValid = useMemo(
    () =>
      serviceAccountJson.includes('"type"') &&
      serviceAccountJson.includes("service_account"),
    [serviceAccountJson],
  );

  const loadConfig = useCallback(async () => {
    const response = await fetch("/api/directory/config", { cache: "no-store" });
    const data = (await response.json()) as DirectoryConfigResponse;
    setConfig(data);

    if (isConfigured(data)) {
      setProvider(data.provider);
      setAutoSyncEnabled(data.autoSyncEnabled);
      setAutoSyncIntervalHours(data.autoSyncIntervalHours);
      const scope = parseScopeFilter(data.scopeFilter);
      setScopeDomain(scope.domain);
      setDepartmentTags(scope.departments);
      setSetupExpanded(false);
    }

    return data;
  }, []);

  const loadUsers = useCallback(async () => {
    const response = await fetch("/api/directory/users?activeOnly=false", {
      cache: "no-store",
    });

    if (!response.ok) {
      return;
    }

    const data = (await response.json()) as DirectoryUserRecord[];
    setUsers(data);
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        const data = await loadConfig();
        if (isConfigured(data) && data.lastSyncStatus === "success") {
          await loadUsers();
        }
      } finally {
        setLoadingConfig(false);
      }
    })();
  }, [loadConfig, loadUsers]);

  function buildCredentials(): Record<string, string> {
    if (provider === "microsoft") {
      return {
        tenantId: tenantId.trim(),
        clientId: clientId.trim(),
        clientSecret: clientSecret.trim(),
      };
    }

    return {
      serviceAccountJson: serviceAccountJson.trim(),
      adminEmail: adminEmail.trim(),
      domain: workspaceDomain.trim(),
    };
  }

  function buildScopeFilter() {
    const filter: Record<string, string | string[]> = {};

    if (scopeDomain.trim()) {
      filter.domain = scopeDomain.trim();
    }

    if (departmentTags.length > 0) {
      filter.departments = departmentTags;
    }

    return Object.keys(filter).length > 0 ? filter : null;
  }

  async function handleTestConnection(): Promise<void> {
    setTestPending(true);
    setTestResult(null);
    setSaveMessage(null);

    try {
      const response = await fetch("/api/directory/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider,
          credentials: buildCredentials(),
        }),
      });

      const result = (await response.json()) as TestResult;
      setTestResult(result);
      setTestPassed(result.success);
    } catch {
      setTestResult({
        success: false,
        userCount: 0,
        sampleUsers: [],
        error: "Connection test failed.",
      });
      setTestPassed(false);
    } finally {
      setTestPending(false);
    }
  }

  async function handleSaveAndSync(): Promise<void> {
    setSaveProgress("saving");
    setSaveMessage("Saving...");

    try {
      const saveResponse = await fetch("/api/directory/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider,
          displayName: buildDisplayName(provider, workspaceDomain),
          credentials: buildCredentials(),
          autoSyncEnabled,
          autoSyncIntervalHours,
          scopeFilter: buildScopeFilter(),
          isEnabled: true,
        }),
      });

      if (!saveResponse.ok) {
        throw new Error("Failed to save directory configuration.");
      }

      setSaveProgress("syncing");
      setSaveMessage("Syncing users...");

      const syncResponse = await fetch("/api/directory/sync", {
        method: "POST",
      });
      const syncResult = (await syncResponse.json()) as {
        success: boolean;
        totalUsers: number;
        error: string | null;
      };

      if (!syncResponse.ok || !syncResult.success) {
        throw new Error(syncResult.error ?? "Directory sync failed.");
      }

      await loadConfig();
      await loadUsers();
      setSaveProgress("complete");
      setSaveMessage(
        `Sync complete — ${syncResult.totalUsers} users imported`,
      );
    } catch (error) {
      setSaveProgress("idle");
      setSaveMessage(
        error instanceof Error ? error.message : "Save and sync failed.",
      );
    }
  }

  async function handleSyncNow(): Promise<void> {
    setSyncPending(true);
    setSaveMessage(null);

    try {
      const response = await fetch("/api/directory/sync", { method: "POST" });
      const result = (await response.json()) as {
        success: boolean;
        error: string | null;
      };

      if (!response.ok || !result.success) {
        throw new Error(result.error ?? "Sync failed.");
      }

      await loadConfig();
      await loadUsers();
    } catch (error) {
      setSaveMessage(
        error instanceof Error ? error.message : "Sync failed.",
      );
    } finally {
      setSyncPending(false);
    }
  }

  function addDepartmentTag(): void {
    const value = departmentInput.trim();

    if (!value || departmentTags.includes(value)) {
      return;
    }

    setDepartmentTags((current) => [...current, value]);
    setDepartmentInput("");
  }

  function renderStatusCard() {
    if (loadingConfig) {
      return (
        <div className="rounded-xl border border-slate-200 bg-white p-6">
          <div className="h-6 w-48 animate-pulse rounded bg-slate-200" />
        </div>
      );
    }

    if (!configured) {
      return (
        <div className="flex items-start gap-4 rounded-xl border border-slate-200 bg-slate-50 p-6 text-slate-700">
          <UsersOffIcon />
          <div>
            <p className="font-semibold text-slate-900">No directory connected</p>
            <p className="mt-1 text-sm">
              Follow the setup guide below to connect your employee directory.
            </p>
          </div>
        </div>
      );
    }

    if (config.lastSyncStatus === "syncing" || syncPending) {
      return (
        <div className="flex items-start gap-4 rounded-xl border border-blue-200 bg-blue-50 p-6 text-blue-900">
          <Spinner className="h-6 w-6" />
          <div>
            <p className="font-semibold">Sync in progress...</p>
          </div>
        </div>
      );
    }

    if (config.lastSyncStatus === "failed") {
      return (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-6 text-rose-900">
          <div className="flex items-start gap-4">
            <AlertIcon />
            <div className="flex-1">
              <p className="font-semibold">Last sync failed</p>
              {config.lastSyncError ? (
                <p className="mt-1 text-sm">{config.lastSyncError}</p>
              ) : null}
              <button
                type="button"
                onClick={() => void handleSyncNow()}
                disabled={syncPending}
                className="mt-4 rounded-md bg-rose-700 px-4 py-2 text-sm font-medium text-white hover:bg-rose-800 disabled:opacity-60"
              >
                Sync now
              </button>
            </div>
          </div>
        </div>
      );
    }

    if (config.lastSyncStatus === "success") {
      return (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-6 text-emerald-900">
          <div className="flex items-start gap-4">
            <UsersIcon />
            <div className="flex-1">
              <p className="font-semibold">{config.displayName} connected</p>
              <p className="mt-1 text-sm">
                Last synced:{" "}
                {config.lastSyncAt
                  ? `${formatRelativeTime(config.lastSyncAt)} — ${config.lastSyncCount ?? 0} users`
                  : "never"}
              </p>
              <div className="mt-4 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => void handleSyncNow()}
                  disabled={syncPending}
                  className="rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800 disabled:opacity-60"
                >
                  Sync now
                </button>
                <button
                  type="button"
                  onClick={() => setShowUsersModal(true)}
                  className="rounded-md border border-emerald-300 bg-white px-4 py-2 text-sm font-medium text-emerald-800 hover:bg-emerald-100"
                >
                  View users
                </button>
              </div>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-6 text-slate-700">
        <p className="font-semibold text-slate-900">
          {config.displayName} configured
        </p>
        <p className="mt-1 text-sm">Run a sync to import users.</p>
        <button
          type="button"
          onClick={() => void handleSyncNow()}
          className="mt-4 rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white"
        >
          Sync now
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {renderStatusCard()}

      <section className="rounded-xl border border-slate-200 bg-white p-6">
        <h2 className="text-base font-semibold text-slate-900">
          Directory provider
        </h2>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          {(
            [
              {
                id: "microsoft" as const,
                title: "Microsoft 365",
                subtitle: "Connect via Microsoft Entra ID (Azure Active Directory)",
                detail: "Requires Azure AD App Registration — 5 minute setup",
                bestFor: "companies using Outlook, Teams, Microsoft 365",
              },
              {
                id: "google" as const,
                title: "Google Workspace",
                subtitle: "Connect via Google Workspace Admin SDK",
                detail: "Requires a Google Cloud Service Account — 10 minute setup",
                bestFor: "companies using Gmail, Google Drive, Google Meet",
              },
            ] as const
          ).map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() => {
                setProvider(option.id);
                setTestResult(null);
                setTestPassed(false);
              }}
              className={`rounded-xl border p-5 text-left transition ${
                provider === option.id
                  ? "border-indigo-500 bg-indigo-50 ring-2 ring-indigo-200"
                  : "border-slate-200 hover:border-slate-300"
              }`}
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100 text-sm font-bold text-slate-700">
                {option.id === "microsoft" ? "MS" : "G"}
              </div>
              <p className="mt-4 text-lg font-semibold text-slate-900">
                {option.title}
              </p>
              <p className="mt-1 text-sm text-slate-600">{option.subtitle}</p>
              <p className="mt-2 text-xs text-slate-500">{option.detail}</p>
              <p className="mt-3 text-xs text-slate-500">
                Best for: {option.bestFor}
              </p>
            </button>
          ))}
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-6">
        <button
          type="button"
          onClick={() => setSetupExpanded((current) => !current)}
          className="flex w-full items-center justify-between text-left"
        >
          <h2 className="text-base font-semibold text-slate-900">
            Setup instructions
          </h2>
          <span className="text-sm text-slate-500">
            {setupExpanded ? "Collapse" : "Expand"}
          </span>
        </button>

        {setupExpanded ? (
          <div className="mt-4 space-y-4 text-sm text-slate-700">
            {provider === "microsoft" ? (
              <>
                <div>
                  <p className="font-medium text-slate-900">
                    Step 1: Register an application in Azure AD
                  </p>
                  <p className="mt-1">
                    Go to portal.azure.com → Azure Active Directory → App
                    registrations → New registration
                  </p>
                  <p>Name: {SUGGESTED_APP_NAME}</p>
                  <p>
                    Supported account types: Accounts in this organizational
                    directory only
                  </p>
                  <p>No redirect URI needed</p>
                  <button
                    type="button"
                    onClick={async () => {
                      await navigator.clipboard.writeText(SUGGESTED_APP_NAME);
                      setCopyMessage("App name copied.");
                    }}
                    className="mt-2 rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium"
                  >
                    Copy suggested app name
                  </button>
                </div>
                <div>
                  <p className="font-medium text-slate-900">
                    Step 2: Copy your Tenant ID and Client ID
                  </p>
                  <p className="mt-1">
                    After registration, go to Overview. Copy the Directory
                    (tenant) ID and Application (client) ID.
                  </p>
                </div>
                <div>
                  <p className="font-medium text-slate-900">
                    Step 3: Create a Client Secret
                  </p>
                  <p className="mt-1">
                    Go to Certificates & secrets → New client secret. Copy the
                    secret VALUE immediately — it is only shown once.
                  </p>
                </div>
                <div>
                  <p className="font-medium text-slate-900">
                    Step 4: Grant API permissions
                  </p>
                  <p className="mt-1">
                    Add Microsoft Graph Application permission User.Read.All,
                    then Grant admin consent.
                  </p>
                </div>
                <p className="font-medium text-slate-900">
                  Step 5: Paste credentials below
                </p>
              </>
            ) : (
              <>
                <div>
                  <p className="font-medium text-slate-900">
                    Step 1: Create a Google Cloud Project
                  </p>
                  <p className="mt-1">
                    Go to console.cloud.google.com → New Project. Name: Contract
                    System Directory
                  </p>
                </div>
                <div>
                  <p className="font-medium text-slate-900">
                    Step 2: Enable the Admin SDK API
                  </p>
                </div>
                <div>
                  <p className="font-medium text-slate-900">
                    Step 3: Create a Service Account and download JSON key
                  </p>
                </div>
                <div>
                  <p className="font-medium text-slate-900">
                    Step 4: Grant Domain-Wide Delegation in Google Workspace Admin
                  </p>
                  <p className="mt-1">
                    OAuth scope:
                    https://www.googleapis.com/auth/admin.directory.user.readonly
                  </p>
                </div>
                <p className="font-medium text-slate-900">
                  Step 5: Paste credentials below
                </p>
              </>
            )}
          </div>
        ) : null}

        {copyMessage ? (
          <p className="mt-3 text-xs text-emerald-700">{copyMessage}</p>
        ) : null}

        <div className="mt-6 grid gap-4 md:grid-cols-2">
          {provider === "microsoft" ? (
            <>
              <label className="block text-sm md:col-span-1">
                <span className="font-medium text-slate-700">
                  Directory (tenant) ID
                </span>
                <input
                  value={tenantId}
                  onChange={(event) => setTenantId(event.target.value)}
                  placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
                />
              </label>
              <label className="block text-sm md:col-span-1">
                <span className="font-medium text-slate-700">
                  Application (client) ID
                </span>
                <input
                  value={clientId}
                  onChange={(event) => setClientId(event.target.value)}
                  placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
                />
              </label>
              <label className="block text-sm md:col-span-2">
                <span className="font-medium text-slate-700">
                  Client secret value
                </span>
                <div className="relative mt-1">
                  <input
                    type={showClientSecret ? "text" : "password"}
                    value={clientSecret}
                    onChange={(event) => setClientSecret(event.target.value)}
                    placeholder="Paste the secret value (not the secret ID)"
                    className="w-full rounded-md border border-slate-300 px-3 py-2 pr-20"
                  />
                  <button
                    type="button"
                    onClick={() => setShowClientSecret((current) => !current)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-slate-600"
                  >
                    {showClientSecret ? "Hide" : "Show"}
                  </button>
                </div>
              </label>
            </>
          ) : (
            <>
              <label className="block text-sm md:col-span-2">
                <span className="font-medium text-slate-700">
                  Service account key (JSON)
                </span>
                <textarea
                  value={serviceAccountJson}
                  onChange={(event) => setServiceAccountJson(event.target.value)}
                  rows={6}
                  placeholder='Paste the contents of the downloaded .json key file'
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 font-mono text-xs"
                />
                <p className="mt-1 text-xs text-slate-500">
                  {serviceAccountJson.length} characters
                  {serviceAccountLooksValid ? " · Valid JSON structure detected" : ""}
                </p>
              </label>
              <label className="block text-sm">
                <span className="font-medium text-slate-700">
                  Workspace admin email
                </span>
                <input
                  type="email"
                  value={adminEmail}
                  onChange={(event) => setAdminEmail(event.target.value)}
                  placeholder="admin@yourcompany.com"
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
                />
              </label>
              <label className="block text-sm">
                <span className="font-medium text-slate-700">
                  Google Workspace domain
                </span>
                <input
                  value={workspaceDomain}
                  onChange={(event) => setWorkspaceDomain(event.target.value)}
                  placeholder="yourcompany.com"
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
                />
              </label>
            </>
          )}
        </div>

        <div className="mt-6 flex items-start gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
          <LockIcon />
          <div>
            <p className="font-semibold text-slate-900">Security information</p>
            <p className="mt-1">
              Credentials are encrypted using AES-256-GCM before storage and are
              never logged or transmitted in plain text. Your IT team can rotate
              credentials at any time by entering new values and clicking Save.
            </p>
            <p className="mt-2">
              This integration uses read-only API permissions. The system cannot
              modify your directory.
            </p>
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-6">
        <button
          type="button"
          onClick={() => setScopeExpanded((current) => !current)}
          className="flex w-full items-center justify-between text-left"
        >
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              Limit which users are synced
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Optional — sync all users by default
            </p>
          </div>
          <span className="text-sm text-slate-500">
            {scopeExpanded ? "Collapse" : "Expand"}
          </span>
        </button>

        {scopeExpanded ? (
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <label className="block text-sm">
              <span className="font-medium text-slate-700">
                Email domain filter
              </span>
              <input
                value={scopeDomain}
                onChange={(event) => setScopeDomain(event.target.value)}
                placeholder="yourcompany.com"
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
              />
            </label>
            <div className="text-sm">
              <span className="font-medium text-slate-700">
                Departments to include
              </span>
              <div className="mt-1 flex flex-wrap gap-2 rounded-md border border-slate-300 p-2">
                {departmentTags.map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-1 text-xs"
                  >
                    {tag}
                    <button
                      type="button"
                      onClick={() =>
                        setDepartmentTags((current) =>
                          current.filter((entry) => entry !== tag),
                        )
                      }
                    >
                      ×
                    </button>
                  </span>
                ))}
                <input
                  value={departmentInput}
                  onChange={(event) => setDepartmentInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      addDepartmentTag();
                    }
                  }}
                  placeholder="Type department and press Enter"
                  className="min-w-[12rem] flex-1 border-0 bg-transparent px-1 py-1 text-sm outline-none"
                />
              </div>
            </div>
          </div>
        ) : null}
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-6">
        <h2 className="text-base font-semibold text-slate-900">Sync settings</h2>
        <label className="mt-4 flex items-start gap-3 text-sm">
          <input
            type="checkbox"
            checked={autoSyncEnabled}
            onChange={(event) => setAutoSyncEnabled(event.target.checked)}
            className="mt-1"
          />
          <span>
            <span className="font-medium text-slate-900">
              Automatically sync daily
            </span>
            <span className="mt-1 block text-slate-600">
              The directory will sync once per day at 2am UTC to keep user data
              current.
            </span>
          </span>
        </label>

        {autoSyncEnabled ? (
          <label className="mt-4 block max-w-md text-sm">
            <span className="font-medium text-slate-700">Sync frequency</span>
            <select
              value={autoSyncIntervalHours}
              onChange={(event) =>
                setAutoSyncIntervalHours(Number(event.target.value))
              }
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
            >
              {SYNC_INTERVAL_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-6">
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => void handleTestConnection()}
            disabled={testPending}
            className="inline-flex items-center gap-2 rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-900 hover:bg-slate-50 disabled:opacity-60"
          >
            {testPending ? <Spinner /> : null}
            Test connection
          </button>
          <button
            type="button"
            onClick={() => void handleSaveAndSync()}
            disabled={!testPassed || saveProgress === "saving" || saveProgress === "syncing"}
            className="inline-flex items-center gap-2 rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
          >
            {saveProgress === "saving" || saveProgress === "syncing" ? (
              <Spinner />
            ) : null}
            Save and sync
          </button>
        </div>

        {saveMessage ? (
          <p className="mt-3 text-sm text-slate-700">{saveMessage}</p>
        ) : null}

        {testResult?.success ? (
          <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
            <p className="font-semibold">Connection successful</p>
            <p className="mt-1">
              Found {testResult.userCount} users in your directory
            </p>
            <ul className="mt-3 space-y-1">
              {testResult.sampleUsers.map((user) => (
                <li key={user.email}>
                  {user.displayName} · {user.email}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {testResult && !testResult.success ? (
          <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900">
            <p className="font-semibold">Connection failed</p>
            <p className="mt-1">{testResult.error}</p>
            {testResult.error ? (
              <p className="mt-2 text-xs">
                {getTroubleshootingTip(provider, testResult.error)}
              </p>
            ) : null}
          </div>
        ) : null}
      </section>

      {configured && config.lastSyncStatus === "success" ? (
        <UsersPreviewTable
          users={users}
          searchQuery={usersSearch}
          onSearchChange={setUsersSearch}
          page={usersPage}
          onPageChange={setUsersPage}
        />
      ) : null}

      {showUsersModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="max-h-[90vh] w-full max-w-5xl overflow-y-auto rounded-xl bg-white p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-slate-900">
                Synced users
              </h3>
              <button
                type="button"
                onClick={() => setShowUsersModal(false)}
                className="rounded-md border border-slate-300 px-3 py-1.5 text-sm"
              >
                Close
              </button>
            </div>
            <UsersPreviewTable
              users={users}
              searchQuery={usersSearch}
              onSearchChange={setUsersSearch}
              page={usersPage}
              onPageChange={setUsersPage}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
