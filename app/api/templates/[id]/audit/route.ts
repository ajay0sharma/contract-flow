import { NextResponse } from "next/server";
import { listTemplateAuditLog } from "@/lib/audit-log";
import { resolveClauseLibraryOrganizationId } from "@/lib/clause-library-org";
import { getContractTemplateById } from "@/lib/contract-template-store";
import { reportError } from "@/lib/error-reporting";
import { requireTemplateManager } from "@/lib/template-route-auth";

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

  try {
    const entries = await listTemplateAuditLog(id, organizationId);
    return NextResponse.json({ entries });
  } catch (error) {
    reportError(error, { route: "GET /api/templates/[id]/audit" });
    return NextResponse.json(
      { error: "Failed to load template audit trail." },
      { status: 500 },
    );
  }
}
