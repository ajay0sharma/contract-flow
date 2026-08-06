import { NextRequest, NextResponse } from "next/server";
import { resolveRequestedOrganizationId } from "@/lib/contract-email-org";
import { reportError } from "@/lib/error-reporting";
import { isSignatureWebhookAuthorized } from "@/lib/signature-integration";
import { completeSignatureEnvelope } from "@/lib/signature-service";

interface SignatureWebhookBody {
  organizationId?: string;
  contractId?: string;
  envelopeId?: string;
  externalEnvelopeId?: string;
  status?: "completed" | "declined" | "voided" | "failed";
  event?: string;
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as SignatureWebhookBody;
    const organizationId =
      resolveRequestedOrganizationId(
        body.organizationId ??
          request.nextUrl.searchParams.get("organizationId") ??
          "",
      ) ?? null;

    if (!organizationId) {
      return NextResponse.json(
        { error: "organizationId is required." },
        { status: 400 },
      );
    }

    const providedSecret =
      request.headers.get("x-signature-secret") ??
      request.headers.get("x-webhook-secret") ??
      request.nextUrl.searchParams.get("secret");

    const authorized = await isSignatureWebhookAuthorized(
      organizationId,
      providedSecret,
    );

    if (!authorized) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const contractId = body.contractId?.trim();
    const externalEnvelopeId =
      body.externalEnvelopeId?.trim() ?? body.envelopeId?.trim();

    if (!contractId && !externalEnvelopeId) {
      return NextResponse.json(
        { error: "contractId or externalEnvelopeId is required." },
        { status: 400 },
      );
    }

    const status =
      body.status ??
      (body.event === "signature_completed" ? "completed" : undefined) ??
      "completed";

    const envelope = await completeSignatureEnvelope({
      organizationId,
      contractId,
      externalEnvelopeId,
      status,
      actorEmail: "signature@contract-flow.app",
      actorName: "E-signature webhook",
    });

    if (!envelope) {
      return NextResponse.json(
        { error: "Signature envelope not found." },
        { status: 404 },
      );
    }

    return NextResponse.json({ success: true, envelope });
  } catch (error) {
    reportError(error, { route: "POST /api/webhooks/signature" });
    return NextResponse.json(
      { error: "Signature webhook processing failed." },
      { status: 500 },
    );
  }
}
