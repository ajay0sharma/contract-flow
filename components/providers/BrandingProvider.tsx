"use client";

import Link from "next/link";
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useDeferredEffect } from "@/lib/use-deferred-effect";
import type { OrganizationBrandingView } from "@/types/organization-branding";
import { DEFAULT_ORGANIZATION_BRANDING } from "@/types/organization-branding";

interface BrandingContextValue {
  branding: OrganizationBrandingView;
  loading: boolean;
  refreshBranding: () => Promise<void>;
}

const defaultBranding: OrganizationBrandingView = {
  organizationId: "default",
  productName: DEFAULT_ORGANIZATION_BRANDING.productName,
  tagline: DEFAULT_ORGANIZATION_BRANDING.tagline,
  accentColor: DEFAULT_ORGANIZATION_BRANDING.accentColor,
  logoUrl: null,
  logoFileName: null,
};

const BrandingContext = createContext<BrandingContextValue | null>(null);

export function BrandingProvider({ children }: { children: ReactNode }) {
  const [branding, setBranding] = useState<OrganizationBrandingView>(defaultBranding);
  const [loading, setLoading] = useState(true);

  const refreshBranding = useCallback(async () => {
    try {
      const response = await fetch("/api/branding", { cache: "no-store" });

      if (!response.ok) {
        return;
      }

      const data = (await response.json()) as { branding?: OrganizationBrandingView };

      if (data.branding) {
        setBranding(data.branding);
      }
    } catch {
      // Keep defaults when branding cannot be loaded.
    } finally {
      setLoading(false);
    }
  }, []);

  useDeferredEffect(() => {
    void refreshBranding();
  }, [refreshBranding]);

  const value = useMemo(
    () => ({
      branding,
      loading,
      refreshBranding,
    }),
    [branding, loading, refreshBranding],
  );

  return (
    <BrandingContext.Provider value={value}>{children}</BrandingContext.Provider>
  );
}

export function useBranding(): BrandingContextValue {
  const context = useContext(BrandingContext);

  if (!context) {
    return {
      branding: defaultBranding,
      loading: false,
      refreshBranding: async () => {},
    };
  }

  return context;
}

export function AppHeaderBrand({
  accentColor,
  homePath,
}: {
  accentColor: string;
  homePath: string;
}) {
  const { branding } = useBranding();

  return (
    <Link href={homePath} className="flex min-w-0 items-center gap-3 text-gray-900">
      {branding.logoUrl ? (
        <span className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-md border border-gray-100 bg-white">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={branding.logoUrl}
            alt={`${branding.productName} logo`}
            className="h-full w-full object-contain p-0.5"
          />
        </span>
      ) : (
        <span style={{ color: accentColor }}>
          <svg
            aria-hidden
            viewBox="0 0 24 24"
            className="h-5 w-5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M8 3h8l4 4v14H8z M16 3v4h4" />
          </svg>
        </span>
      )}
      <span className="min-w-0">
        <span className="block truncate text-base font-semibold">
          {branding.productName}
        </span>
        {branding.tagline ? (
          <span className="hidden truncate text-xs text-gray-500 sm:block">
            {branding.tagline}
          </span>
        ) : null}
      </span>
    </Link>
  );
}
