import { NextResponse } from "next/server";
import { requireTemplateManager } from "@/lib/template-route-auth";
import { resolveClauseLibraryOrganizationId } from "@/lib/clause-library-org";
import {
  getContractTemplateById,
  listTemplateVersionHistory,
} from "@/lib/contract-template-store";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await requireTemplateManager();

  if ("response" in auth) {
    return auth.response;
  }

  const organizationId = resolveClauseLibraryOrganizationId();
  const { id } = await context.params;
  const template = await getContractTemplateById(id, organizationId);

  if (!template) {
    return NextResponse.json({ error: "Template not found." }, { status: 404 });
  }

  const versions = await listTemplateVersionHistory(id, organizationId);

  return NextResponse.json({
    versions,
    currentVersion: template.version,
  });
}
