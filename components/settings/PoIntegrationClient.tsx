"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { PoAuthType, PoProvider } from "@/lib/generated/prisma/enums";
import type { PublicPoIntegrationConfig } from "@/lib/po-integration";
import {
  DEFAULT_FIELD_MAPPING_ROWS,
  fieldMappingsToRows,
  getProviderOption,
  PO_AUTH_TYPE_OPTIONS,
  PO_MAPPING_TARGETS,
  PO_PROVIDER_OPTIONS,
  rowsToFieldMappings,
  type PoFieldMappingRow,
  type PoProviderOptionId,
} from "@/lib/po-settings";
import { isSystemContractTemplateType } from "@/lib/contract-template-utils";
import {
  CONTRACT_TEMPLATE_TYPES,
  CONTRACT_TEMPLATE_TYPE_LABELS,
  type ContractTemplateType,
} from "@/types/contract-template";
import type { PoLookupResult } from "@/types/po-integration";

type PoConfigResponse =
  | ({ configured: false } & Partial<PublicPoIntegrationConfig>)
  | PublicPoIntegrationConfig;

interface CredentialFormState {
  apiKey: string;
  username: string;
  password: string;
  clientId: string;
  clientSecret: string;
  tokenUrl: string;
}

const EMPTY_CREDENTIALS: CredentialFormState = {
  apiKey: "",
  username: "",
  password: "",
  clientId: "",
  clientSecret: "",
  tokenUrl: "",
};

function PlugIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 22v-5" />
      <path d="M9 8V2h6v6" />
      <path d="M5 12H4a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h1" />
      <path d="M19 12h1a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-1" />
    </svg>
  );
}

function PlugOffIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 22v-5" />
      <path d="M9 8V2h6v6" />
      <path d="M5 12H4a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h1" />
      <path d="M19 12h1a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-1" />
      <path d="m2 2 20 20" />
    </svg>
  );
}

function BuildingIcon({ className = "h-7 w-7" }: { className?: string }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4 21V5a1 1 0 0 1 1-1h5v17" />
      <path d="M10 21V9h4v12" />
      <path d="M14 21V3h5a1 1 0 0 1 1 1v17" />
      <path d="M7 8h1M7 12h1M7 16h1M17 8h1M17 12h1M17 16h1" />
    </svg>
  );
}

function SettingsIcon({ className = "h-7 w-7" }: { className?: string }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9c.26.604.852.997 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      className="h-3.5 w-3.5"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </svg>
  );
}

function ToggleSwitch({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
        checked ? "bg-indigo-600" : "bg-slate-300"
      }`}
    >
      <span
        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow transition ${
          checked ? "translate-x-5" : "translate-x-0"
        }`}
      />
    </button>
  );
}

function createMappingRow(
  sourceField = "",
  targetField = "vendor",
): PoFieldMappingRow {
  return {
    id: `mapping-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    sourceField,
    targetField,
  };
}

function credentialsFromForm(
  authType: PoAuthType,
  credentials: CredentialFormState,
): Record<string, string> {
  if (authType === "api_key" && credentials.apiKey.trim()) {
    return { apiKey: credentials.apiKey.trim() };
  }

  if (
    authType === "basic_auth" &&
    credentials.username.trim() &&
    credentials.password.trim()
  ) {
    return {
      username: credentials.username.trim(),
      password: credentials.password.trim(),
    };
  }

  if (authType === "oauth2") {
    const next: Record<string, string> = {};

    if (credentials.clientId.trim()) {
      next.clientId = credentials.clientId.trim();
    }

    if (credentials.clientSecret.trim()) {
      next.clientSecret = credentials.clientSecret.trim();
    }

    if (credentials.tokenUrl.trim()) {
      next.tokenUrl = credentials.tokenUrl.trim();
    }

    return next;
  }

  return {};
}

function hasCredentialInput(
  authType: PoAuthType,
  credentials: CredentialFormState,
): boolean {
  return Object.keys(credentialsFromForm(authType, credentials)).length > 0;
}

function parseAllowedContractTypes(
  value: PublicPoIntegrationConfig["allowedContractTypes"],
): ContractTemplateType[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(
    (entry): entry is ContractTemplateType =>
      typeof entry === "string" && isSystemContractTemplateType(entry),
  );
}

function parseFieldMappings(
  value: PublicPoIntegrationConfig["fieldMappings"],
): Record<string, string> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, entryValue]) => [key, String(entryValue)]),
  );
}

export function PoIntegrationClient() {
  const testSectionRef = useRef<HTMLDivElement>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [savedConfigured, setSavedConfigured] = useState(false);
  const [hasStoredCredentials, setHasStoredCredentials] = useState(false);

  const [provider, setProvider] = useState<PoProviderOptionId>("coupa");
  const [displayName, setDisplayName] = useState("Coupa");
  const [baseUrl, setBaseUrl] = useState("");
  const [authType, setAuthType] = useState<PoAuthType>("api_key");
  const [credentials, setCredentials] =
    useState<CredentialFormState>(EMPTY_CREDENTIALS);
  const [autoPopulateOnMatch, setAutoPopulateOnMatch] = useState(true);
  const [requirePoNumber, setRequirePoNumber] = useState(false);
  const [allowedContractTypes, setAllowedContractTypes] = useState<
    ContractTemplateType[]
  >([]);
  const [isEnabled, setIsEnabled] = useState(false);
  const [mappingRows, setMappingRows] = useState<PoFieldMappingRow[]>(
    DEFAULT_FIELD_MAPPING_ROWS.map((row, index) => ({
      ...row,
      id: `default-${index}`,
    })),
  );
  const [mappingsExpanded, setMappingsExpanded] = useState(false);

  const [testPoNumber, setTestPoNumber] = useState("");
  const [testResult, setTestResult] = useState<PoLookupResult | null>(null);
  const [testError, setTestError] = useState<string | null>(null);

  const selectedProvider = useMemo(
    () => getProviderOption(provider),
    [provider],
  );

  useEffect(() => {
    let cancelled = false;

    void fetch("/api/po/config")
      .then(async (response) => {
        if (!response.ok) {
          throw new Error("Unable to load PO configuration.");
        }

        return (await response.json()) as PoConfigResponse;
      })
      .then((config) => {
        if (cancelled) {
          return;
        }

        if (config.configured) {
          const providerOption = getProviderOption(config.provider);

          if (config.provider !== "manual" && providerOption) {
            setProvider(providerOption.id);
          }

          setDisplayName(config.displayName);
          setBaseUrl(config.baseUrl ?? "");
          setAuthType(config.authType);
          setAutoPopulateOnMatch(config.autoPopulateOnMatch);
          setRequirePoNumber(config.requirePoNumber);
          setAllowedContractTypes(parseAllowedContractTypes(config.allowedContractTypes));
          setIsEnabled(config.isEnabled);
          setMappingRows(fieldMappingsToRows(parseFieldMappings(config.fieldMappings)));
          setSavedConfigured(true);
          setHasStoredCredentials(config.hasStoredCredentials);
        }
      })
      .catch((loadError) => {
        if (!cancelled) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Unable to load PO configuration.",
          );
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  function handleProviderSelect(nextProvider: PoProviderOptionId): void {
    const option = getProviderOption(nextProvider);

    if (!option) {
      return;
    }

    setProvider(nextProvider);
    setDisplayName(option.defaultDisplayName);
    setAuthType(option.defaultAuthType);
    setCredentials(EMPTY_CREDENTIALS);
    setError(null);
    setSuccessMessage(null);
  }

  function handleCredentialChange<K extends keyof CredentialFormState>(
    key: K,
    value: CredentialFormState[K],
  ): void {
    setCredentials((current) => ({ ...current, [key]: value }));
  }

  function toggleContractType(type: ContractTemplateType): void {
    setAllowedContractTypes((current) =>
      current.includes(type)
        ? current.filter((entry) => entry !== type)
        : [...current, type],
    );
  }

  function addMappingRow(): void {
    setMappingRows((current) => [...current, createMappingRow()]);
  }

  function updateMappingRow(
    id: string,
    patch: Partial<Pick<PoFieldMappingRow, "sourceField" | "targetField">>,
  ): void {
    setMappingRows((current) =>
      current.map((row) => (row.id === id ? { ...row, ...patch } : row)),
    );
  }

  function removeMappingRow(id: string): void {
    setMappingRows((current) => current.filter((row) => row.id !== id));
  }

  function buildSavePayload() {
    const credentialPayload = credentialsFromForm(authType, credentials);

    return {
      provider: provider as PoProvider,
      displayName: displayName.trim(),
      baseUrl: baseUrl.trim() || null,
      authType,
      credentials:
        Object.keys(credentialPayload).length > 0
          ? credentialPayload
          : undefined,
      fieldMappings: rowsToFieldMappings(mappingRows),
      autoPopulateOnMatch,
      requirePoNumber,
      allowedContractTypes: requirePoNumber
        ? allowedContractTypes.length > 0
          ? allowedContractTypes
          : null
        : null,
      isEnabled,
    };
  }

  function validateForSave(): string | null {
    if (!displayName.trim()) {
      return "Display name is required.";
    }

    if (!baseUrl.trim()) {
      return "Base URL is required.";
    }

    const credentialPayload = credentialsFromForm(authType, credentials);
    const hasCredentials =
      Object.keys(credentialPayload).length > 0 || hasStoredCredentials;

    if (!hasCredentials) {
      return "Enter at least one credential field before saving.";
    }

    if (authType === "api_key" && !credentialPayload.apiKey && !hasStoredCredentials) {
      return "API key is required.";
    }

    if (
      authType === "basic_auth" &&
      (!credentialPayload.username || !credentialPayload.password) &&
      !hasStoredCredentials
    ) {
      return "Username and password are required.";
    }

    if (authType === "oauth2" && !hasStoredCredentials) {
      if (!credentialPayload.clientId || !credentialPayload.clientSecret) {
        return "Client ID and client secret are required.";
      }

      if (!credentialPayload.tokenUrl) {
        return "Token URL is required for OAuth 2.0.";
      }
    }

    return null;
  }

  async function handleSave(): Promise<void> {
    const validationError = validateForSave();

    if (validationError) {
      setError(validationError);
      setSuccessMessage(null);
      return;
    }

    setIsSaving(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const response = await fetch("/api/po/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildSavePayload()),
      });
      const payload = (await response.json()) as PublicPoIntegrationConfig & {
        error?: string;
      };

      if (!response.ok) {
        throw new Error(payload.error ?? "Failed to save PO configuration.");
      }

      setSavedConfigured(true);
      setHasStoredCredentials(payload.hasStoredCredentials);
      setCredentials(EMPTY_CREDENTIALS);
      setSuccessMessage(
        "PO integration saved. Users can now look up PO numbers from the intake form.",
      );
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Failed to save PO configuration.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function handleToggleEnabled(nextEnabled: boolean): Promise<void> {
    setIsEnabled(nextEnabled);

    if (!savedConfigured) {
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      const response = await fetch("/api/po/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...buildSavePayload(),
          isEnabled: nextEnabled,
        }),
      });
      const payload = (await response.json()) as { error?: string };

      if (!response.ok) {
        throw new Error(payload.error ?? "Failed to update PO integration.");
      }

      setSuccessMessage(
        nextEnabled
          ? `${displayName} enabled. PO lookup is now active.`
          : `${displayName} disabled.`,
      );
    } catch (toggleError) {
      setIsEnabled(!nextEnabled);
      setError(
        toggleError instanceof Error
          ? toggleError.message
          : "Failed to update PO integration.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function handleRunTest(): Promise<void> {
    const trimmedPoNumber = testPoNumber.trim();

    if (trimmedPoNumber.length < 2) {
      setTestError("Enter a PO number with at least 2 characters.");
      setTestResult(null);
      return;
    }

    setIsTesting(true);
    setTestError(null);
    setTestResult(null);

    try {
      const response = await fetch("/api/po/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          poNumber: trimmedPoNumber,
          provider,
          displayName: displayName.trim(),
          baseUrl: baseUrl.trim() || null,
          authType,
          credentials: credentialsFromForm(authType, credentials),
          fieldMappings: rowsToFieldMappings(mappingRows),
          useStoredCredentials:
            hasStoredCredentials && !hasCredentialInput(authType, credentials),
        }),
      });

      const payload = (await response.json()) as {
        success?: boolean;
        result?: PoLookupResult;
        error?: string;
      };

      if (!response.ok || !payload.success || !payload.result) {
        throw new Error(payload.error ?? "PO connection test failed.");
      }

      setTestResult(payload.result);
    } catch (runError) {
      setTestError(
        runError instanceof Error
          ? runError.message
          : "PO connection test failed.",
      );
    } finally {
      setIsTesting(false);
    }
  }

  function scrollToTestSection(): void {
    testSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  if (isLoading) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-8 text-sm text-slate-600">
        Loading PO integration settings...
      </div>
    );
  }

  const statusConfigured = savedConfigured;
  const statusEnabled = statusConfigured && isEnabled;

  return (
    <div className="space-y-8">
      {successMessage ? (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {successMessage}
        </div>
      ) : null}

      {error ? (
        <div className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {error}
        </div>
      ) : null}

      <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        {!statusConfigured ? (
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-500">
              <PlugOffIcon />
            </div>
            <div className="flex-1">
              <h2 className="text-base font-semibold text-slate-900">
                No PO system connected
              </h2>
              <p className="mt-1 text-sm text-slate-600">
                Configure a connection below to enable automatic PO number lookup.
              </p>
            </div>
          </div>
        ) : statusEnabled ? (
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex gap-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
                <PlugIcon />
              </div>
              <div>
                <h2 className="text-base font-semibold text-slate-900">
                  {displayName} connected
                </h2>
                <p className="mt-1 text-sm text-slate-600">
                  PO lookup is active. Users will see auto-population when entering
                  PO numbers.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-4">
              <button
                type="button"
                onClick={scrollToTestSection}
                className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Test connection
              </button>
              <div className="flex items-center gap-2">
                <span className="text-sm text-slate-600">Disable</span>
                <ToggleSwitch
                  checked={isEnabled}
                  onChange={(checked) => {
                    void handleToggleEnabled(checked);
                  }}
                  label="Disable PO integration"
                />
              </div>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex gap-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-100 text-amber-700">
                <PlugOffIcon />
              </div>
              <div>
                <h2 className="text-base font-semibold text-slate-900">
                  {displayName} — disabled
                </h2>
                <p className="mt-1 text-sm text-slate-600">
                  Re-enable the integration to restore PO lookup on the intake form.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-slate-600">Enable</span>
              <ToggleSwitch
                checked={isEnabled}
                onChange={(checked) => {
                  void handleToggleEnabled(checked);
                }}
                label="Enable PO integration"
              />
            </div>
          </div>
        )}
      </section>

      <section className="space-y-4">
        <div>
          <h2 className="text-base font-semibold text-slate-900">PO system</h2>
          <p className="mt-1 text-sm text-slate-600">
            Choose the procurement platform you want to connect.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
          {PO_PROVIDER_OPTIONS.map((option) => {
            const isSelected = provider === option.id;

            return (
              <button
                key={option.id}
                type="button"
                onClick={() => handleProviderSelect(option.id)}
                className={
                  isSelected
                    ? "flex min-h-0 w-full cursor-pointer flex-col items-start gap-2 rounded-xl border-2 border-blue-500 bg-blue-50 p-5 text-left transition-all"
                    : "flex min-h-0 w-full cursor-pointer flex-col items-start gap-2 rounded-xl border-2 border-gray-200 p-5 text-left transition-all hover:border-blue-300 hover:bg-blue-50"
                }
              >
                {option.id === "other" ? (
                  <SettingsIcon className="h-7 w-7 flex-shrink-0 text-blue-600" />
                ) : (
                  <BuildingIcon className="h-7 w-7 flex-shrink-0 text-blue-600" />
                )}
                <h3 className="text-sm font-semibold leading-snug text-gray-900">
                  {option.name}
                </h3>
                <p className="text-xs leading-relaxed text-gray-500">
                  {option.description}
                </p>
              </button>
            );
          })}
        </div>
      </section>

      <section className="space-y-5 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-base font-semibold text-slate-900">
          Connection settings
        </h2>

        <div>
          <label
            htmlFor="po-display-name"
            className="block text-sm font-medium text-slate-700"
          >
            Display name <span className="text-rose-600">*</span>
          </label>
          <p className="mt-1 text-xs text-slate-500">
            What should we call this system?
          </p>
          <input
            id="po-display-name"
            type="text"
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
            className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </div>

        <div>
          <label
            htmlFor="po-base-url"
            className="block text-sm font-medium text-slate-700"
          >
            Base URL <span className="text-rose-600">*</span>
          </label>
          <p className="mt-1 text-xs text-slate-500">
            Your {selectedProvider?.name ?? "PO system"} instance URL
          </p>
          <input
            id="po-base-url"
            type="url"
            value={baseUrl}
            onChange={(event) => setBaseUrl(event.target.value)}
            placeholder={selectedProvider?.baseUrlPlaceholder}
            className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </div>

        <div>
          <label
            htmlFor="po-auth-type"
            className="block text-sm font-medium text-slate-700"
          >
            Authentication type
          </label>
          <select
            id="po-auth-type"
            value={authType}
            onChange={(event) =>
              setAuthType(event.target.value as PoAuthType)
            }
            className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          >
            {PO_AUTH_TYPE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        {authType === "api_key" ? (
          <div>
            <label
              htmlFor="po-api-key"
              className="block text-sm font-medium text-slate-700"
            >
              API Key {!hasStoredCredentials ? (
                <span className="text-rose-600">*</span>
              ) : null}
            </label>
            <p className="mt-1 text-xs text-slate-500">
              Paste your API key — it will be encrypted before storage
            </p>
            <input
              id="po-api-key"
              type="password"
              value={credentials.apiKey}
              onChange={(event) =>
                handleCredentialChange("apiKey", event.target.value)
              }
              placeholder={
                hasStoredCredentials ? "Leave blank to keep existing key" : ""
              }
              className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
        ) : null}

        {authType === "basic_auth" ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label
                htmlFor="po-username"
                className="block text-sm font-medium text-slate-700"
              >
                Username {!hasStoredCredentials ? (
                  <span className="text-rose-600">*</span>
                ) : null}
              </label>
              <input
                id="po-username"
                type="text"
                value={credentials.username}
                onChange={(event) =>
                  handleCredentialChange("username", event.target.value)
                }
                className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label
                htmlFor="po-password"
                className="block text-sm font-medium text-slate-700"
              >
                Password {!hasStoredCredentials ? (
                  <span className="text-rose-600">*</span>
                ) : null}
              </label>
              <p className="mt-1 text-xs text-slate-500">
                Credentials are encrypted before storage
              </p>
              <input
                id="po-password"
                type="password"
                value={credentials.password}
                onChange={(event) =>
                  handleCredentialChange("password", event.target.value)
                }
                placeholder={
                  hasStoredCredentials ? "Leave blank to keep existing password" : ""
                }
                className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
          </div>
        ) : null}

        {authType === "oauth2" ? (
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label
                  htmlFor="po-client-id"
                  className="block text-sm font-medium text-slate-700"
                >
                  Client ID {!hasStoredCredentials ? (
                    <span className="text-rose-600">*</span>
                  ) : null}
                </label>
                <input
                  id="po-client-id"
                  type="text"
                  value={credentials.clientId}
                  onChange={(event) =>
                    handleCredentialChange("clientId", event.target.value)
                  }
                  className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label
                  htmlFor="po-client-secret"
                  className="block text-sm font-medium text-slate-700"
                >
                  Client Secret {!hasStoredCredentials ? (
                    <span className="text-rose-600">*</span>
                  ) : null}
                </label>
                <input
                  id="po-client-secret"
                  type="password"
                  value={credentials.clientSecret}
                  onChange={(event) =>
                    handleCredentialChange("clientSecret", event.target.value)
                  }
                  placeholder={
                    hasStoredCredentials
                      ? "Leave blank to keep existing secret"
                      : ""
                  }
                  className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
            </div>
            <div>
              <label
                htmlFor="po-token-url"
                className="block text-sm font-medium text-slate-700"
              >
                Token URL {!hasStoredCredentials ? (
                  <span className="text-rose-600">*</span>
                ) : null}
              </label>
              <p className="mt-1 text-xs text-slate-500">
                Your OAuth token endpoint URL
              </p>
              <input
                id="po-token-url"
                type="url"
                value={credentials.tokenUrl}
                onChange={(event) =>
                  handleCredentialChange("tokenUrl", event.target.value)
                }
                className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
          </div>
        ) : null}

        <p className="flex items-center gap-2 text-xs text-slate-500">
          <LockIcon />
          Credentials are encrypted with AES-256 and never stored in plain text.
        </p>
      </section>

      <section className="space-y-5 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-base font-semibold text-slate-900">
          Behavior settings
        </h2>

        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-slate-900">
              Auto-populate fields on PO match
            </p>
            <p className="mt-1 text-sm text-slate-600">
              When a PO is found, automatically fill in vendor name, amount, and
              other available fields
            </p>
          </div>
          <ToggleSwitch
            checked={autoPopulateOnMatch}
            onChange={setAutoPopulateOnMatch}
            label="Auto-populate fields on PO match"
          />
        </div>

        <div className="flex items-start justify-between gap-4 border-t border-slate-100 pt-5">
          <div>
            <p className="text-sm font-medium text-slate-900">
              Require PO number
            </p>
            <p className="mt-1 text-sm text-slate-600">
              Make PO number mandatory for contracts involving payment
            </p>
          </div>
          <ToggleSwitch
            checked={requirePoNumber}
            onChange={setRequirePoNumber}
            label="Require PO number"
          />
        </div>

        {requirePoNumber ? (
          <div className="rounded-md border border-slate-200 bg-slate-50 p-4">
            <p className="text-sm font-medium text-slate-900">
              Apply to contract types
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Leave all unchecked to require PO number for all contract types
            </p>
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {CONTRACT_TEMPLATE_TYPES.map((type) => (
                <label
                  key={type}
                  className="flex items-center gap-2 text-sm text-slate-700"
                >
                  <input
                    type="checkbox"
                    checked={allowedContractTypes.includes(type)}
                    onChange={() => toggleContractType(type)}
                    className="h-4 w-4 rounded border-slate-300 text-indigo-600"
                  />
                  {CONTRACT_TEMPLATE_TYPE_LABELS[type]}
                </label>
              ))}
            </div>
          </div>
        ) : null}
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <button
          type="button"
          onClick={() => setMappingsExpanded((current) => !current)}
          className="flex w-full items-center justify-between text-left"
        >
          <h2 className="text-base font-semibold text-slate-900">
            Field mappings (advanced)
          </h2>
          <span className="text-sm text-indigo-600">
            {mappingsExpanded ? "Collapse" : "Expand"}
          </span>
        </button>

        {mappingsExpanded ? (
          <div className="mt-4 space-y-4">
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-slate-500">
                    <th className="px-2 py-2 font-medium">
                      Your PO system field name
                    </th>
                    <th className="px-2 py-2 font-medium">Maps to</th>
                    <th className="px-2 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {mappingRows.map((row) => (
                    <tr key={row.id} className="border-b border-slate-100">
                      <td className="px-2 py-2">
                        <input
                          type="text"
                          value={row.sourceField}
                          onChange={(event) =>
                            updateMappingRow(row.id, {
                              sourceField: event.target.value,
                            })
                          }
                          className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                        />
                      </td>
                      <td className="px-2 py-2">
                        <select
                          value={row.targetField}
                          onChange={(event) =>
                            updateMappingRow(row.id, {
                              targetField: event.target.value,
                            })
                          }
                          className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                        >
                          {PO_MAPPING_TARGETS.map((target) => (
                            <option key={target.value} value={target.value}>
                              {target.label}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-2 py-2 text-right">
                        <button
                          type="button"
                          onClick={() => removeMappingRow(row.id)}
                          className="text-xs font-medium text-rose-600 hover:text-rose-800"
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <button
              type="button"
              onClick={addMappingRow}
              className="text-sm font-medium text-indigo-600 hover:text-indigo-800"
            >
              Add mapping
            </button>

            <p className="text-xs text-slate-500">
              Field names are the exact keys returned by your PO system&apos;s API.
              Contact your IT team if you are unsure what field names your system
              uses.
            </p>
          </div>
        ) : null}
      </section>

      <section
        ref={testSectionRef}
        className="space-y-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
      >
        <div>
          <h2 className="text-base font-semibold text-slate-900">
            Test connection
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            Run a lookup against your PO system to verify credentials and field
            mappings.
          </p>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex-1">
            <label
              htmlFor="po-test-number"
              className="block text-sm font-medium text-slate-700"
            >
              Enter a PO number to test
            </label>
            <input
              id="po-test-number"
              type="text"
              value={testPoNumber}
              onChange={(event) => setTestPoNumber(event.target.value)}
              placeholder="PO-2026-11842"
              className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <button
            type="button"
            onClick={() => {
              void handleRunTest();
            }}
            disabled={isTesting}
            className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isTesting ? "Running test..." : "Run test"}
          </button>
        </div>

        {testResult ? (
          <div className="space-y-2">
            <p className="text-sm font-medium text-emerald-700">
              Connection successful
            </p>
            <pre className="overflow-x-auto rounded-md border border-slate-200 bg-slate-950 p-4 text-xs text-slate-100">
              {JSON.stringify(testResult, null, 2)}
            </pre>
          </div>
        ) : null}

        {testError ? (
          <div className="rounded-md border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
            <p className="font-medium text-rose-700">{testError}</p>
            <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-slate-600">
              <li>Check the base URL is correct and accessible from our servers</li>
              <li>Verify the API credentials are valid</li>
              <li>Confirm the PO number exists in your system</li>
            </ul>
          </div>
        ) : null}
      </section>

      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => {
            void handleSave();
          }}
          disabled={isSaving}
          className="rounded-md bg-indigo-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isSaving ? "Saving..." : "Save configuration"}
        </button>
      </div>
    </div>
  );
}
