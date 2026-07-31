import { NextResponse } from "next/server";
import { resolveClauseLibraryOrganizationId } from "@/lib/clause-library-org";
import {
  syncInboundContractEmailAndPersist,
  type InboundContractEmailInput,
} from "@/lib/contract-persistence";
import { extractRecordNumberFromSubject } from "@/lib/email-sources";
import { reportError } from "@/lib/error-reporting";

interface InboundWebhookBody {
  recordNumber?: string;
  subject?: string;
  from?: string;
  to?: string;
  cc?: string;
  body?: string;
  sentAt?: string;
  provider?: "microsoft" | "google" | "webhook";
  providerMessageId?: string;
  direction?: "inbound" | "outbound";
}

function isAuthorized(request: Request): boolean {
  const configuredSecret =
    process.env.CONTRACT_EMAIL_WEBHOOK_SECRET?.trim() ||
    process.env.CRON_SECRET?.trim();

  if (!configuredSecret) {
    return false;
  }

  const authorization = request.headers.get("authorization")?.trim() ?? "";
  const bearerToken = authorization.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length).trim()
    : "";
  const headerSecret = request.headers.get("x-contract-email-secret")?.trim() ?? "";

  return bearerToken === configuredSecret || headerSecret === configuredSecret;
}

export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    const body = (await request.json()) as InboundWebhookBody;
    const subject = body.subject?.trim() ?? "";
    const from = body.from?.trim() ?? "";
    const to = body.to?.trim() ?? "";
    const messageBody = body.body?.trim() ?? "";

    if (!subject || !from || !to) {
      return NextResponse.json(
        { error: "Subject, from, and to are required." },
        { status: 400 },
      );
    }

    const recordNumber =
      body.recordNumber?.trim().toUpperCase() ??
      extractRecordNumberFromSubject(subject);

    if (!recordNumber) {
      return NextResponse.json(
        {
          error:
            "Could not match email to a contract record. Include recordNumber or [CR-######] in the subject.",
        },
        { status: 422 },
      );
    }

    const input: InboundContractEmailInput = {
      recordNumber,
      subject,
      from,
      to,
      cc: body.cc?.trim(),
      body: messageBody,
      sentAt: body.sentAt,
      provider: body.provider,
      providerMessageId: body.providerMessageId,
      direction: body.direction,
    };

    const organizationId = resolveClauseLibraryOrganizationId();
    const result = await syncInboundContractEmailAndPersist(organizationId, input);

    if (!result) {
      return NextResponse.json(
        { error: "Contract record not found." },
        { status: 404 },
      );
    }

    return NextResponse.json({
      success: true,
      contractId: result.contractId,
      emailId: result.emailId,
      duplicate: result.duplicate,
    });
  } catch (error) {
    reportError(error, { route: "POST /api/webhooks/contract-email" });

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to sync inbound contract email.",
      },
      { status: 500 },
    );
  }
}
