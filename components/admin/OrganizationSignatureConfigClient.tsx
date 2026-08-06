"use client";

import { useCallback, useMemo, useState } from "react";
import type { SignatureProvider } from "@/lib/generated/prisma/enums";
import { withAdminOrganizationQuery } from "@/lib/admin-api-path";
import { inputClassName } from "@/components/ui/FormField";
import {
  getSignatureProviderOption,
  SIGNATURE_PROVIDER_OPTIONS,
} from "@/lib/signature-settings";
import { useDeferredEffect } from "@/lib/use-deferred-effect";
import type { SignatureIntegrationConfigRecord } from "@/types/signature-integration";

interface OrganizationSignatureConfigClientProps {
  organizationId: string;
}

function credentialsFromForm(
  provider: SignatureProvider,
  values: Record<string, string>,
): Record<string, string> {
  const option = getSignatureProviderOption(provider);
  const next: Record<string, string> = {};

  for (const field of option?.credentialFields ?? []) {
    const value = values[field.key]?.trim();

    if (value) {
      next[field.key] = value;
    }
  }

  return next;
}

export function OrganizationSignatureConfigClient({
  organizationId,
}: OrganizationSignatureConfigClientProps) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [config, setConfig] = useState<SignatureIntegrationConfigRecord | null>(
    null,
  );
  const [provider, setProvider] = useState<SignatureProvider>("manual");
  const [displayName, setDisplayName] = useState("Manual signature");
  const [accountId, setAccountId] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [isEnabled, setIsEnabled] = useState(false);
  const [autoActivateOnComplete, setAutoActivateOnComplete] = useState(true);
  const [reminderDays, setReminderDays] = useState(3);
  const [webhookSecret, setWebhookSecret] = useState("");
  const [credentialValues, setCredentialValues] = useState<
    Record<string, string>
  >({});

  const providerOption = useMemo(
    () => getSignatureProviderOption(provider),
    [provider],
  );

  const applyConfig = useCallback((next: SignatureIntegrationConfigRecord) => {
    setConfig(next);
    setProvider(next.provider);
    setDisplayName(next.displayName);
    setAccountId(next.accountId ?? "");
    setBaseUrl(next.baseUrl ?? "");
    setIsEnabled(next.isEnabled);
    setAutoActivateOnComplete(next.autoActivateOnComplete);
    setReminderDays(next.reminderDays);
    setWebhookSecret("");
    setCredentialValues({});
  }, []);

  const loadConfig = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(
        withAdminOrganizationQuery("/api/admin/signature-config", organizationId),
        { cache: "no-store" },
      );

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as
          | { error?: string }
          | null;
        throw new Error(
          payload?.error ?? "Failed to load e-signature configuration.",
        );
      }

      applyConfig(
        (await response.json()) as SignatureIntegrationConfigRecord,
      );
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Failed to load e-signature configuration.",
      );
    } finally {
      setLoading(false);
    }
  }, [applyConfig, organizationId]);

  useDeferredEffect(() => {
    void loadConfig();
  }, [loadConfig]);

  function buildSavePayload() {
    const credentialPayload = credentialsFromForm(provider, credentialValues);

    return {
      provider,
      displayName: displayName.trim(),
      accountId: accountId.trim() || null,
      baseUrl: baseUrl.trim() || null,
      isEnabled,
      autoActivateOnComplete,
      reminderDays,
      webhookSecret: webhookSecret.trim() || undefined,
      credentials:
        Object.keys(credentialPayload).length > 0
          ? credentialPayload
          : undefined,
    };
  }

  async function handleSave(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const response = await fetch(
        withAdminOrganizationQuery("/api/admin/signature-config", organizationId),
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(buildSavePayload()),
        },
      );

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as
          | { error?: string }
          | null;
        throw new Error(
          payload?.error ?? "Failed to save e-signature configuration.",
        );
      }

      applyConfig(
        (await response.json()) as SignatureIntegrationConfigRecord,
      );
      setSuccessMessage("E-signature settings saved.");
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Failed to save e-signature configuration.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleTestConnection() {
    setTesting(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const credentialPayload = credentialsFromForm(provider, credentialValues);
      const response = await fetch(
        withAdminOrganizationQuery("/api/signature/test", organizationId),
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            provider,
            displayName,
            accountId: accountId.trim() || null,
            baseUrl: baseUrl.trim() || null,
            credentials:
              Object.keys(credentialPayload).length > 0
                ? credentialPayload
                : undefined,
            useStoredCredentials:
              Object.keys(credentialPayload).length === 0 &&
              Boolean(config?.hasStoredCredentials),
          }),
        },
      );

      const result = (await response.json()) as {
        success: boolean;
        message: string;
        error?: string | null;
      };

      if (!response.ok || !result.success) {
        throw new Error(result.error ?? result.message);
      }

      setSuccessMessage(result.message);
      await loadConfig();
    } catch (testError) {
      setError(
        testError instanceof Error
          ? testError.message
          : "Connection test failed.",
      );
    } finally {
      setTesting(false);
    }
  }

  if (loading) {
    return (
      <div className="rounded-2xl border border-gray-100 bg-white p-6 text-sm text-gray-500 shadow-sm">
        Loading e-signature configuration…
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSave}
      className="space-y-6 rounded-2xl border border-gray-100 bg-white p-6 shadow-sm"
    >
      <div>
        <h2 className="text-base font-semibold text-gray-900">
          Client e-signature application
        </h2>
        <p className="mt-1 text-sm text-gray-500">
          Configure how contracts move from approval to signature and activation
          for this organization.
        </p>
      </div>

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      {successMessage ? (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {successMessage}
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2">
        {SIGNATURE_PROVIDER_OPTIONS.map((option) => (
          <button
            key={option.id}
            type="button"
            onClick={() => {
              setProvider(option.id);
              setDisplayName(option.defaultDisplayName);
            }}
            className={`rounded-xl border p-4 text-left ${
              provider === option.id
                ? "border-indigo-500 bg-indigo-50 ring-2 ring-indigo-200"
                : "border-gray-200 hover:border-gray-300"
            }`}
          >
            <p className="font-medium text-gray-900">{option.name}</p>
            <p className="mt-1 text-sm text-gray-500">{option.description}</p>
          </button>
        ))}
      </div>

      <label className="block text-sm">
        <span className="font-medium text-gray-700">Display name</span>
        <input
          value={displayName}
          onChange={(event) => setDisplayName(event.target.value)}
          className={`${inputClassName} mt-1`}
        />
      </label>

      {provider === "docusign" ? (
        <label className="block text-sm">
          <span className="font-medium text-gray-700">DocuSign account ID</span>
          <input
            value={accountId}
            onChange={(event) => setAccountId(event.target.value)}
            className={`${inputClassName} mt-1`}
            placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
          />
        </label>
      ) : null}

      {provider !== "manual" ? (
        <label className="block text-sm">
          <span className="font-medium text-gray-700">API base URL</span>
          <input
            value={baseUrl}
            onChange={(event) => setBaseUrl(event.target.value)}
            className={`${inputClassName} mt-1`}
            placeholder="Leave blank to use provider default"
          />
        </label>
      ) : null}

      {providerOption?.credentialFields.map((field) => (
        <label key={field.key} className="block text-sm">
          <span className="font-medium text-gray-700">{field.label}</span>
          {field.type === "textarea" ? (
            <textarea
              value={credentialValues[field.key] ?? ""}
              onChange={(event) =>
                setCredentialValues((current) => ({
                  ...current,
                  [field.key]: event.target.value,
                }))
              }
              rows={5}
              placeholder={field.placeholder}
              className={`${inputClassName} mt-1 font-mono text-xs`}
            />
          ) : (
            <input
              type={field.type ?? "text"}
              value={credentialValues[field.key] ?? ""}
              onChange={(event) =>
                setCredentialValues((current) => ({
                  ...current,
                  [field.key]: event.target.value,
                }))
              }
              placeholder={field.placeholder}
              className={`${inputClassName} mt-1`}
            />
          )}
          {config?.hasStoredCredentials ? (
            <p className="mt-1 text-xs text-gray-500">
              Stored credentials are saved. Leave blank to keep them.
            </p>
          ) : null}
        </label>
      ))}

      <label className="block text-sm">
        <span className="font-medium text-gray-700">
          Completion webhook secret
        </span>
        <input
          type="password"
          value={webhookSecret}
          onChange={(event) => setWebhookSecret(event.target.value)}
          className={`${inputClassName} mt-1`}
          placeholder={
            config?.hasWebhookSecret
              ? "Leave blank to keep the stored secret"
              : "Used to verify POST /api/webhooks/signature"
          }
        />
      </label>

      <label className="flex items-start gap-3 text-sm">
        <input
          type="checkbox"
          checked={isEnabled}
          onChange={(event) => setIsEnabled(event.target.checked)}
          className="mt-1"
        />
        <span>
          <span className="font-medium text-gray-900">Enable e-signature</span>
          <span className="mt-1 block text-gray-500">
            Legal users can send approved contracts for signature from the
            contract workflow panel.
          </span>
        </span>
      </label>

      <label className="flex items-start gap-3 text-sm">
        <input
          type="checkbox"
          checked={autoActivateOnComplete}
          onChange={(event) => setAutoActivateOnComplete(event.target.checked)}
          className="mt-1"
        />
        <span>
          <span className="font-medium text-gray-900">
            Auto-activate when signing completes
          </span>
          <span className="mt-1 block text-gray-500">
            Move contracts to active automatically when a completion webhook is
            received.
          </span>
        </span>
      </label>

      <label className="block max-w-xs text-sm">
        <span className="font-medium text-gray-700">Reminder interval (days)</span>
        <input
          type="number"
          min={0}
          value={reminderDays}
          onChange={(event) => setReminderDays(Number(event.target.value))}
          className={`${inputClassName} mt-1`}
        />
      </label>

      {config?.lastTestAt ? (
        <p className="text-xs text-gray-500">
          Last connection test: {config.lastTestStatus} at{" "}
          {new Date(config.lastTestAt).toLocaleString()}
          {config.lastTestError ? ` — ${config.lastTestError}` : ""}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() => void handleTestConnection()}
          disabled={testing || saving}
          className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-900 hover:bg-gray-50 disabled:opacity-60"
        >
          {testing ? "Testing…" : "Test connection"}
        </button>
        <button
          type="submit"
          disabled={saving || testing}
          className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
        >
          {saving ? "Saving…" : "Save settings"}
        </button>
      </div>
    </form>
  );
}
