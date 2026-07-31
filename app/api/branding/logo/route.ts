import { currentUser } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { resolveClauseLibraryOrganizationId } from "@/lib/clause-library-org";
import { getOrganizationBranding } from "@/lib/organization-branding-store";
import { reportError } from "@/lib/error-reporting";
import {
  ORGANIZATION_BRANDING_BUCKET,
  getSupabaseAdminClient,
  isSupabaseStorageConfigured,
} from "@/lib/supabase-storage";

function resolveLogoContentType(fileName: string | null): string {
  const lower = (fileName ?? "").toLowerCase();

  if (lower.endsWith(".png")) {
    return "image/png";
  }

  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) {
    return "image/jpeg";
  }

  if (lower.endsWith(".svg")) {
    return "image/svg+xml";
  }

  if (lower.endsWith(".webp")) {
    return "image/webp";
  }

  if (lower.endsWith(".gif")) {
    return "image/gif";
  }

  return "application/octet-stream";
}

export async function GET() {
  const user = await currentUser();

  if (!user) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  if (!isSupabaseStorageConfigured()) {
    return new NextResponse("Organization image storage is not configured.", {
      status: 503,
    });
  }

  try {
    const organizationId = resolveClauseLibraryOrganizationId();
    const branding = await getOrganizationBranding(organizationId);

    if (!branding.logoStoragePath) {
      return new NextResponse("Logo not found.", { status: 404 });
    }

    const supabase = getSupabaseAdminClient();
    const { data, error } = await supabase.storage
      .from(ORGANIZATION_BRANDING_BUCKET)
      .download(branding.logoStoragePath);

    if (error || !data) {
      return new NextResponse("Logo not found.", { status: 404 });
    }

    const buffer = Buffer.from(await data.arrayBuffer());

    return new NextResponse(buffer, {
      headers: {
        "Content-Type": resolveLogoContentType(branding.logoFileName),
        "Cache-Control": "private, max-age=300",
      },
    });
  } catch (error) {
    reportError(error, { route: "GET /api/branding/logo" });
    return new NextResponse("Unable to load organization logo.", {
      status: 500,
    });
  }
}
