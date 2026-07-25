import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedTemplateReader } from "@/lib/template-route-auth";
import { resolveClauseLibraryOrganizationId } from "@/lib/clause-library-org";
import { listActiveContractTemplates } from "@/lib/contract-template-store";
import type { ContractTemplateType } from "@/types/contract-template";

export async function GET(request: NextRequest) {
  const auth = await requireAuthenticatedTemplateReader();

  if ("response" in auth) {
    return auth.response;
  }

  const organizationId = resolveClauseLibraryOrganizationId();
  const contractType = request.nextUrl.searchParams.get("contractType")?.trim();

  const templates = await listActiveContractTemplates(organizationId);
  const filtered = contractType
    ? templates.filter((template) => template.contractType === contractType)
    : templates;

  return NextResponse.json({
    templates: filtered,
    organizationId,
    contractType: (contractType as ContractTemplateType | undefined) ?? null,
  });
}
