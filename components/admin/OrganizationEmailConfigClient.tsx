"use client";

import { useCallback, useEffect, useState } from "react";
import { inputClassName } from "@/components/ui/FormField";
import { withAdminOrganizationQuery } from "@/lib/admin-api-path";

interface OrganizationEmailConfigClientProps {
  organizationId: string;
}

interface EmailConfigView {
  organizationId: string;
  syncEnabled: boolean;
  outboundWebhookUrl: string | null;
  mailboxEmails: string[];
  hasWebhookSecret: boolean;
  lastSyncAt: string | null;
  lastSyncStatus: string | null;
  lastSyncError: string | null;
}

export function OrganizationEmailConfigClient({
  organizationId,
}: OrganizationEmailConfigClientProps) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [syncEnabled, setSyncEnabled] = useState(true);
  const [outboundWebhookUrl, setOutboundWebhookUrl] = useState("");
  const [webhookSecret, setWebhookSecret] = useState("");
  const [hasWebhookSecret, setHasWebhookSecret] = useState(false);
  const [mailboxInput, setMailboxInput] = useState("");
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);
  const [lastSyncStatus, setLastSyncStatus] = useState<string | null>(null);
  const [lastSyncError, setLastSyncError] = useState<string | null>(null);

  const applyConfig = useCallback((config: EmailConfigView) => {
    setSyncEnabled(config.syncEnabled);
    setOutboundWebhookUrl(config.outboundWebhookUrl ?? "");
    setHasWebhookSecret(config.hasWebhookSecret);
    setWebhookSecret("");
    setMailboxInput(config.mailboxEmails.join("\n"));
    setLastSyncAt(config.lastSyncAt);
    setLastSyncStatus(config.lastSyncStatus);
    setLastSyncError(config.lastSyncError);
  }, []);

  const loadConfig = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(
        withAdminOrganizationQuery("/api/admin/email-config", organizationId),
        { cache: "no-store" },
      );

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as
          | { error?: string }
          | null;
        throw new Error(payload?.error ?? "Failed to load email configuration.");
      }

      const config = (await response.json()) as EmailConfigView;
      applyConfig(config);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Failed to load email configuration.",
      );
    } finally {
      setLoading(false);
    }
  }, [applyConfig, organizationId]);

  useEffect(() => {
    void loadConfig();
  }, [loadConfig]);

  async function handleSave(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setSuccessMessage(null);

    const mailboxEmails = mailboxInput
      .split(/[\n,;]+/)
      .map((entry) => entry.trim())
      .filter(Boolean);

    const invalidMailbox = mailboxEmails.find(
      (entry) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(entry),
    );

    if (invalidMailbox) {
      setError(`Invalid mailbox email: ${invalidMailbox}`);
      setSaving(false);
      return;
    }

    try {
      const response = await fetch(
        withAdminOrganizationQuery("/api/admin/email-config", organizationId),
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            syncEnabled,
            outboundWebhookUrl: outboundWebhookUrl.trim() || null,
            webhookSecret: webhookSecret.trim() || undefined,
            mailboxEmails,
          }),
        },
      );

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as
          | { error?: string }
          | null;
        throw new Error(payload?.error ?? "Failed to save email configuration.");
      }

      const config = (await response.json()) as EmailConfigView;
      applyConfig(config);
      setSuccessMessage("Email integration settings saved.");
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Failed to save email configuration.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleClearWebhookSecret() {
    setSaving(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const response = await fetch(
        withAdminOrganizationQuery("/api/admin/email-config", organizationId),
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ webhookSecret: "" }),
        },
      );

      if (!response.ok) {
        throw new Error("Failed to remove webhook secret.");
      }

      const config = (await response.json()) as EmailConfigView;
      applyConfig(config);
      setSuccessMessage("Inbound webhook secret removed.");
    } catch (clearError) {
      setError(
        clearError instanceof Error
          ? clearError.message
          : "Failed to remove webhook secret.",
      );
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="rounded-2xl border border-gray-100 bg-white p-6 text-sm text-gray-500 shadow-sm">
        Loading email configuration…
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
          Contract email integration
        </h2>
        <p className="mt-1 text-sm text-gray-500">
          Configure inbound and outbound email handling for this client without
          calling admin APIs manually.
        </p>
      </div>

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      {successMessage ? (
        <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
          {successMessage}
        </div>
      ) : null}

      <label className="flex items-start gap-3 text-sm text-gray-700">
        <input
          type="checkbox"
          checked={syncEnabled}
          onChange={(event) => setSyncEnabled(event.target.checked)}
          className="mt-1"
        />
        <span>
          <span className="font-medium text-gray-900">Enable email sync</span>
          <span className="mt-1 block text-gray-500">
            Allow ContractFlow to process inbound contract correspondence for
            this client.
          </span>
        </span>
      </label>

      <div>
        <label className="block text-sm font-medium text-gray-900">
          Outbound webhook URL
        </label>
        <p className="mt-1 text-sm text-gray-500">
          Optional URL ContractFlow calls when sending outbound contract email
          events for this client.
        </p>
        <input
          type="url"
          value={outboundWebhookUrl}
          onChange={(event) => setOutboundWebhookUrl(event.target.value)}
          placeholder="https://example.com/hooks/contract-email"
          className={`${inputClassName} mt-2`}
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-900">
          Inbound webhook secret
        </label>
        <p className="mt-1 text-sm text-gray-500">
          Shared secret used to authenticate inbound email webhook requests.
          {hasWebhookSecret ? " A secret is already configured." : ""}
        </p>
        <input
          type="password"
          value={webhookSecret}
          onChange={(event) => setWebhookSecret(event.target.value)}
          placeholder={hasWebhookSecret ? "Leave blank to keep current secret" : "Enter webhook secret"}
          className={`${inputClassName} mt-2`}
        />
        {hasWebhookSecret ? (
          <button
            type="button"
            disabled={saving}
            onClick={() => {
              void handleClearWebhookSecret();
            }}
            className="mt-2 text-sm font-medium text-red-700 hover:text-red-800 disabled:opacity-50"
          >
            Remove configured secret
          </button>
        ) : null}
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-900">
          Monitored mailboxes
        </label>
        <p className="mt-1 text-sm text-gray-500">
          One email address per line. Only messages sent to these mailboxes are
          processed for this client.
        </p>
        <textarea
          value={mailboxInput}
          onChange={(event) => setMailboxInput(event.target.value)}
          rows={5}
          placeholder={"legal@company.com\ncontracts@company.com"}
          className={`${inputClassName} mt-2 font-mono text-sm`}
        />
      </div>

      {(lastSyncAt || lastSyncStatus || lastSyncError) && (
        <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
          <p className="font-medium text-slate-900">Last sync status</p>
          {lastSyncStatus ? <p className="mt-1">Status: {lastSyncStatus}</p> : null}
          {lastSyncAt ? (
            <p className="mt-1">
              Last run: {new Date(lastSyncAt).toLocaleString()}
            </p>
          ) : null}
          {lastSyncError ? (
            <p className="mt-1 text-red-700">{lastSyncError}</p>
          ) : null}
        </div>
      )}

      <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        Inbound webhook endpoint:{" "}
        <code className="rounded bg-white px-1 py-0.5">
          /api/webhooks/contract-email
        </code>
        . Configure your email provider to POST events to your deployed app URL.
      </div>

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={saving}
          className="rounded-md bg-[#3558A0] px-4 py-2 text-sm font-medium text-white hover:bg-[#2d4a88] disabled:opacity-60"
        >
          {saving ? "Saving…" : "Save email settings"}
        </button>
      </div>
    </form>
  );
}
