import { currentUser } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { reportError } from "@/lib/error-reporting";
import { isLegalEmail } from "@/lib/legal-access";
import {
  buildSignersFromInitiationInput,
  sendContractForSignature,
} from "@/lib/signature-service";
import { resolveSignatureContractContext } from "@/lib/signature-route-utils";
import { getUserDisplayName } from "@/lib/user-display-name";
import type { InitiateSignatureInput } from "@/types/signature-integration";

function parseInitiationInput(body: unknown): InitiateSignatureInput | null {
  if (!body || typeof body !== "object") {
    return null;
  }

  const payload = body as Record<string, unknown>;
  const counterparty = payload.counterparty;
  const internalSigner = payload.internalSigner;

  if (
    !counterparty ||
    typeof counterparty !== "object" ||
    !internalSigner ||
    typeof internalSigner !== "object"
  ) {
    return null;
  }

  const counterpartyRecord = counterparty as Record<string, unknown>;
  const internalRecord = internalSigner as Record<string, unknown>;

  return {
    counterparty: {
      email: String(counterpartyRecord.email ?? "").trim(),
      name: String(counterpartyRecord.name ?? "").trim(),
    },
    internalSigner: {
      email: String(internalRecord.email ?? "").trim(),
      name: String(internalRecord.name ?? "").trim(),
    },
  };
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const user = await currentUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const actorEmail = user.primaryEmailAddress?.emailAddress?.trim() ?? "";
  const actorName = getUserDisplayName(user);

  if (!actorEmail || !isLegalEmail(actorEmail)) {
    return NextResponse.json(
      { error: "Only legal users can initiate e-signature." },
      { status: 403 },
    );
  }

  try {
    const { id } = await context.params;
    const contractContext = await resolveSignatureContractContext(id);

    if (!contractContext) {
      return NextResponse.json({ error: "Contract not found." }, { status: 404 });
    }

    const body = await request.json().catch(() => null);
    const initiationInput = parseInitiationInput(body);

    if (!initiationInput) {
      return NextResponse.json(
        {
          error:
            "Counterparty and internal signer name and email are required.",
        },
        { status: 400 },
      );
    }

    const signers = buildSignersFromInitiationInput(initiationInput);
    const envelope = await sendContractForSignature({
      contractId: id,
      organizationId: contractContext.organizationId,
      actorEmail,
      actorName,
      signers,
    });

    return NextResponse.json(envelope);
  } catch (error) {
    reportError(error, { route: "POST /api/contracts/[id]/send-for-signature" });

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to send contract for signature.",
      },
      { status: 400 },
    );
  }
}
