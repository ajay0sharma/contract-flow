import { currentUser } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { reportError } from "@/lib/error-reporting";
import { isAdminEmail, isLegalEmail } from "@/lib/legal-access";
import { getLatestSignatureEnvelopeForContract } from "@/lib/signature-service";
import { getSignatureIntegrationConfig } from "@/lib/signature-integration";
import { resolveSignatureContractContext } from "@/lib/signature-route-utils";

function canViewSignatureStatus(email: string): boolean {
  return isLegalEmail(email) || isAdminEmail(email);
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const user = await currentUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const actorEmail = user.primaryEmailAddress?.emailAddress?.trim() ?? "";

  if (!actorEmail || !canViewSignatureStatus(actorEmail)) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  try {
    const { id } = await context.params;
    const contractContext = await resolveSignatureContractContext(id);

    if (!contractContext) {
      return NextResponse.json({ error: "Contract not found." }, { status: 404 });
    }

    const [config, envelope] = await Promise.all([
      getSignatureIntegrationConfig(contractContext.organizationId),
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
