import { currentUser } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { resolveClauseLibraryOrganizationId } from "@/lib/clause-library-org";
import { loadContractRecord } from "@/lib/contract-persistence";
import { reportError } from "@/lib/error-reporting";
import { getLatestSignatureEnvelopeForContract } from "@/lib/signature-service";
import { getSignatureIntegrationConfig } from "@/lib/signature-integration";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const user = await currentUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    const { id } = await context.params;
    const organizationId = resolveClauseLibraryOrganizationId();
    const contract = await loadContractRecord(id, organizationId);

    if (!contract) {
      return NextResponse.json({ error: "Contract not found." }, { status: 404 });
    }

    const [config, envelope] = await Promise.all([
      getSignatureIntegrationConfig(organizationId),
      getLatestSignatureEnvelopeForContract(id),
    ]);

    return NextResponse.json({
      configured: config.isEnabled,
      provider: config.provider,
      displayName: config.displayName,
      autoActivateOnComplete: config.autoActivateOnComplete,
      envelope,
    });
  } catch (error) {
    reportError(error, { route: "GET /api/contracts/[id]/signature-status" });
    return NextResponse.json(
      { error: "Failed to load signature status." },
      { status: 500 },
    );
  }
}
