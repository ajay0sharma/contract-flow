import { NextRequest, NextResponse } from "next/server";
import {
  resolveOrganizationIdByRecordNumber,
  resolveRequestedOrganizationId,
} from "@/lib/contract-email-org";
import {
  syncInboundContractEmailAndPersist,
  type InboundContractEmailInput,
} from "@/lib/contract-persistence";
import { extractRecordNumberFromSubject } from "@/lib/email-sources";
import { isOrganizationWebhookAuthorized } from "@/lib/organization-email-config";
import { reportError } from "@/lib/error-reporting";

interface InboundWebhookBody {
  organizationId?: string;
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

function resolveOrganizationIdFromRequest(
  request: NextRequest,
  body: InboundWebhookBody,
): string | null {
  const fromQuery = request.nextUrl.searchParams.get("organizationId");
  const fromBody = body.organizationId;
  const requested = fromBody ?? fromQuery;

  if (requested?.trim()) {
    return resolveRequestedOrganizationId(requested);
  }

  return null;
}

export async function POST(request: NextRequest) {
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

    const located = await resolveOrganizationIdByRecordNumber(recordNumber);

    if (!located) {
      return NextResponse.json(
        { error: "Contract record not found." },
        { status: 404 },
      );
    }

    const requestedOrganizationId = resolveOrganizationIdFromRequest(
      request,
      body,
    );
    const organizationId = requestedOrganizationId ?? located.organizationId;

    if (organizationId !== located.organizationId) {
      return NextResponse.json(
        { error: "Contract record does not belong to this client organization." },
        { status: 403 },
      );
    }

    if (!(await isOrganizationWebhookAuthorized(organizationId, request))) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
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

    const result = await syncInboundContractEmailAndPersist(organizationId, input);

    if (!result) {
      return NextResponse.json(
        { error: "Contract record not found." },
        { status: 404 },
      );
    }

    return NextResponse.json({
      success: true,
      organizationId,
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
