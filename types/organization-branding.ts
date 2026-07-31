export interface OrganizationBrandingRecord {
  organizationId: string;
  productName: string;
  tagline: string | null;
  accentColor: string | null;
  logoStoragePath: string | null;
  logoFileName: string | null;
  updatedById: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface OrganizationBrandingView {
  organizationId: string;
  productName: string;
  tagline: string | null;
  accentColor: string | null;
  logoUrl: string | null;
  logoFileName: string | null;
}

export interface UpdateOrganizationBrandingInput {
  productName?: string;
  tagline?: string | null;
  accentColor?: string | null;
  updatedById: string;
}

export const DEFAULT_ORGANIZATION_BRANDING: Pick<
  OrganizationBrandingRecord,
  "productName" | "tagline" | "accentColor"
> = {
  productName: "ContractFlow",
  tagline: null,
  accentColor: null,
};

export const HEX_COLOR_PATTERN = /^#[0-9A-Fa-f]{6}$/;

export const ORGANIZATION_BRANDING_LOGO_PATH = "/api/branding/logo";

export function buildOrganizationBrandingLogoUrl(
  logoStoragePath: string | null,
  updatedAt?: string,
): string | null {
  if (!logoStoragePath) {
    return null;
  }

  const cacheKey = updatedAt ? encodeURIComponent(updatedAt) : Date.now().toString();

  return `${ORGANIZATION_BRANDING_LOGO_PATH}?v=${cacheKey}`;
}
