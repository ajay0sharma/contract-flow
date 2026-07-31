"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useBranding } from "@/components/providers/BrandingProvider";
import { inputClassName } from "@/components/ui/FormField";
import type { OrganizationBrandingView } from "@/types/organization-branding";

const ACCEPTED_LOGO_TYPES =
  "image/png,image/jpeg,image/svg+xml,image/webp,image/gif";

export function OrganizationBrandingClient() {
  const { refreshBranding } = useBranding();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [storageConfigured, setStorageConfigured] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [branding, setBranding] = useState<OrganizationBrandingView | null>(null);
  const [productName, setProductName] = useState("ContractFlow");
  const [tagline, setTagline] = useState("");
  const [accentColor, setAccentColor] = useState("#3558A0");

  const loadBranding = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/admin/branding", { cache: "no-store" });

      if (!response.ok) {
        throw new Error("Failed to load organization branding.");
      }

      const data = (await response.json()) as {
        branding: OrganizationBrandingView;
        storageConfigured?: boolean;
      };
      applyBranding(data.branding);
      setStorageConfigured(data.storageConfigured ?? true);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Failed to load organization branding.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadBranding();
  }, [loadBranding]);

  function applyBranding(next: OrganizationBrandingView): void {
    setBranding(next);
    setProductName(next.productName);
    setTagline(next.tagline ?? "");
    setAccentColor(next.accentColor ?? "#3558A0");
  }

  async function handleSave(): Promise<void> {
    setSaving(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const response = await fetch("/api/admin/branding", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productName,
          tagline: tagline.trim() || null,
          accentColor: accentColor.trim() || null,
        }),
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(data?.error ?? "Failed to save branding.");
      }

      const data = (await response.json()) as { branding: OrganizationBrandingView };
      applyBranding(data.branding);
      await refreshBranding();
      setSuccessMessage("Header branding saved.");
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Failed to save branding.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleLogoUpload(file: File): Promise<void> {
    setUploadingLogo(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const formData = new FormData();
      formData.append("logo", file);

      const response = await fetch("/api/admin/branding", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(data?.error ?? "Failed to upload logo.");
      }

      const data = (await response.json()) as { branding: OrganizationBrandingView };
      applyBranding(data.branding);
      await refreshBranding();
      setSuccessMessage("Logo uploaded.");
    } catch (uploadError) {
      setError(
        uploadError instanceof Error
          ? uploadError.message
          : "Failed to upload logo.",
      );
    } finally {
      setUploadingLogo(false);
    }
  }

  async function handleRemoveLogo(): Promise<void> {
    setUploadingLogo(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const formData = new FormData();
      formData.append("action", "remove-logo");

      const response = await fetch("/api/admin/branding", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(data?.error ?? "Failed to remove logo.");
      }

      const data = (await response.json()) as { branding: OrganizationBrandingView };
      applyBranding(data.branding);
      await refreshBranding();
      setSuccessMessage("Logo removed.");
    } catch (removeError) {
      setError(
        removeError instanceof Error
          ? removeError.message
          : "Failed to remove logo.",
      );
    } finally {
      setUploadingLogo(false);
    }
  }

  function handleSelectedFile(file: File | null | undefined): void {
    if (!file) {
      return;
    }

    void handleLogoUpload(file);
  }

  function handleDrop(event: React.DragEvent<HTMLDivElement>): void {
    event.preventDefault();
    setDragActive(false);

    const file = event.dataTransfer.files?.[0];
    handleSelectedFile(file);
  }

  if (loading) {
    return (
      <div className="animate-pulse space-y-4">
        <div className="h-32 rounded-2xl bg-gray-100" />
        <div className="h-64 rounded-2xl bg-gray-100" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-gray-900">Header preview</h2>
        <p className="mt-1 text-sm text-gray-500">
          This is how your platform heading will appear for all users in your
          organization.
        </p>
        <div className="mt-5 rounded-xl border border-gray-200 bg-[#F9FAFB] px-4 py-3">
          <div className="flex items-center gap-3">
            {branding?.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={branding.logoUrl}
                alt="Organization logo preview"
                className="h-8 w-8 object-contain"
              />
            ) : (
              <span
                className="flex h-8 w-8 items-center justify-center rounded-md border border-gray-200 bg-white text-xs font-semibold"
                style={{ color: accentColor }}
              >
                {productName.slice(0, 1).toUpperCase()}
              </span>
            )}
            <div className="min-w-0">
              <p className="truncate text-base font-semibold text-gray-900">
                {productName || "ContractFlow"}
              </p>
              {tagline.trim() ? (
                <p className="truncate text-xs text-gray-500">{tagline}</p>
              ) : null}
            </div>
          </div>
        </div>
      </section>

      {!storageConfigured ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Image uploads require Supabase storage. Add{" "}
          <code className="rounded bg-amber-100 px-1">SUPABASE_SERVICE_ROLE_KEY</code>{" "}
          and a Supabase project URL to your environment, then run{" "}
          <code className="rounded bg-amber-100 px-1">
            npm run storage:ensure-branding-bucket
          </code>
          .
        </div>
      ) : null}

      {error ? (
        <div className="rounded-xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      ) : null}

      {successMessage ? (
        <div className="rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {successMessage}
        </div>
      ) : null}

      <section className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-gray-900">Branding settings</h2>
        <p className="mt-1 text-sm text-gray-500">
          Customize the logo, platform name, tagline, and accent color shown in
          the top header.
        </p>

        <div className="mt-6">
          <h3 className="text-sm font-medium text-gray-700">Organization logo</h3>
          <p className="mt-1 text-sm text-gray-500">
            Upload PNG, JPG, SVG, WebP, or GIF images up to 2MB. Drag and drop
            or choose a file.
          </p>

          <div
            onDragEnter={(event) => {
              event.preventDefault();
              setDragActive(true);
            }}
            onDragOver={(event) => {
              event.preventDefault();
              setDragActive(true);
            }}
            onDragLeave={(event) => {
              event.preventDefault();
              setDragActive(false);
            }}
            onDrop={handleDrop}
            className={`mt-4 rounded-xl border-2 border-dashed p-6 transition ${
              dragActive
                ? "border-[#8C6A35] bg-[#FBF7F0]"
                : "border-gray-200 bg-gray-50"
            }`}
          >
            <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
              <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-gray-200 bg-white">
                {branding?.logoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={branding.logoUrl}
                    alt="Uploaded organization logo"
                    className="h-full w-full object-contain p-2"
                  />
                ) : (
                  <span className="text-xs text-gray-400">No logo</span>
                )}
              </div>

              <div className="min-w-0 flex-1 text-center sm:text-left">
                {branding?.logoFileName ? (
                  <p className="truncate text-sm font-medium text-gray-900">
                    {branding.logoFileName}
                  </p>
                ) : (
                  <p className="text-sm text-gray-600">
                    No logo uploaded yet.
                  </p>
                )}
                <p className="mt-1 text-xs text-gray-500">
                  Recommended: square or horizontal logo on a transparent or
                  white background.
                </p>

                <div className="mt-4 flex flex-wrap justify-center gap-2 sm:justify-start">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploadingLogo || !storageConfigured}
                    className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60"
                  >
                    {uploadingLogo ? "Uploading..." : "Choose image"}
                  </button>

                  {branding?.logoUrl ? (
                    <button
                      type="button"
                      onClick={() => void handleRemoveLogo()}
                      disabled={uploadingLogo}
                      className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60"
                    >
                      Remove logo
                    </button>
                  ) : null}
                </div>
              </div>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept={ACCEPTED_LOGO_TYPES}
              className="hidden"
              disabled={uploadingLogo || !storageConfigured}
              onChange={(event) => {
                handleSelectedFile(event.target.files?.[0]);
                event.currentTarget.value = "";
              }}
            />
          </div>
        </div>

        <div className="mt-8 grid gap-5 md:grid-cols-2">
          <div>
            <label htmlFor="productName" className="block text-sm font-medium text-gray-700">
              Platform name
            </label>
            <input
              id="productName"
              value={productName}
              onChange={(event) => setProductName(event.target.value)}
              className={`${inputClassName} mt-1`}
              placeholder="Acme Contract Hub"
            />
          </div>

          <div>
            <label htmlFor="accentColor" className="block text-sm font-medium text-gray-700">
              Accent color
            </label>
            <div className="mt-1 flex items-center gap-3">
              <input
                id="accentColor"
                type="color"
                value={accentColor}
                onChange={(event) => setAccentColor(event.target.value)}
                className="h-10 w-14 cursor-pointer rounded border border-gray-200 bg-white"
              />
              <input
                value={accentColor}
                onChange={(event) => setAccentColor(event.target.value)}
                className={inputClassName}
                placeholder="#3558A0"
              />
            </div>
          </div>

          <div className="md:col-span-2">
            <label htmlFor="tagline" className="block text-sm font-medium text-gray-700">
              Tagline
            </label>
            <input
              id="tagline"
              value={tagline}
              onChange={(event) => setTagline(event.target.value)}
              className={`${inputClassName} mt-1`}
              placeholder="Contract workflow for Acme Corp"
            />
          </div>
        </div>

        <div className="mt-6 flex justify-end">
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={saving}
            className="rounded-lg bg-[#8C6A35] px-4 py-2 text-sm font-medium text-white hover:bg-[#735628] disabled:opacity-60"
          >
            {saving ? "Saving..." : "Save branding"}
          </button>
        </div>
      </section>
    </div>
  );
}
