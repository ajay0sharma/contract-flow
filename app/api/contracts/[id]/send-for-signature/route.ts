import { currentUser } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { resolveClauseLibraryOrganizationId } from "@/lib/clause-library-org";
import { reportError } from "@/lib/error-reporting";
import { isAdminEmail, isLegalEmail } from "@/lib/legal-access";
import { getUserDisplayName } from "@/lib/user-display-name";
import { sendContractForSignature } from "@/lib/signature-service";

function isPrivilegedUser(email: string): boolean {
  return isLegalEmail(email) || isAdminEmail(email);
}

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const user = await currentUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const actorEmail = user.primaryEmailAddress?.emailAddress?.trim() ?? "";
  const actorName = getUserDisplayName(user);

  if (!actorEmail || !isPrivilegedUser(actorEmail)) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  try {
    const { id } = await context.params;
    const organizationId = resolveClauseLibraryOrganizationId();
    const envelope = await sendContractForSignature({
      contractId: id,
      organizationId,
      actorEmail,
      actorName,
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
