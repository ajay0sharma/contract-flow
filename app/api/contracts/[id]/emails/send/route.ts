import { currentUser } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { resolveClauseLibraryOrganizationId } from "@/lib/clause-library-org";
import { sendContractEmailAndPersist } from "@/lib/contract-persistence";
import { reportError } from "@/lib/error-reporting";
import { isAdminEmail, isLegalEmail } from "@/lib/legal-access";
import { getUserDisplayName } from "@/lib/user-display-name";

interface SendEmailBody {
  to?: string;
  cc?: string;
  subject?: string;
  body?: string;
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

  if (!actorEmail) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  if (!isLegalEmail(actorEmail) && !isAdminEmail(actorEmail)) {
    return NextResponse.json(
      { error: "Only legal and admin users can send contract emails." },
      { status: 403 },
    );
  }

  const { id } = await context.params;

  try {
    const body = (await request.json()) as SendEmailBody;
    const to = body.to?.trim() ?? "";
    const subject = body.subject?.trim() ?? "";
    const messageBody = body.body?.trim() ?? "";

    if (!to || !subject || !messageBody) {
      return NextResponse.json(
        { error: "To, subject, and message are required." },
        { status: 400 },
      );
    }

    const organizationId = resolveClauseLibraryOrganizationId();
    const updated = await sendContractEmailAndPersist(
      id,
      organizationId,
      {
        to,
        cc: body.cc?.trim(),
        subject,
        body: messageBody,
      },
      {
        name: actorName,
        email: actorEmail,
      },
    );

    const sentEmail = updated.relatedEmails.at(-1);

    return NextResponse.json({
      success: true,
      email: sentEmail ?? null,
    });
  } catch (error) {
    reportError(error, {
      route: "POST /api/contracts/[id]/emails/send",
      contractId: id,
    });

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to send contract email.",
      },
      { status: 500 },
    );
  }
}
