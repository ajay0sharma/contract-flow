import { currentUser } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { resolveClauseLibraryOrganizationId } from "@/lib/clause-library-org";
import { reportError } from "@/lib/error-reporting";
import { lookupPoNumber } from "@/lib/po-integration";

export async function GET(request: NextRequest) {
  const user = await currentUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const userEmail = user.primaryEmailAddress?.emailAddress?.trim() ?? "";

  if (!userEmail) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const poNumber = request.nextUrl.searchParams.get("poNumber")?.trim() ?? "";

  if (poNumber.length < 2) {
    return NextResponse.json(
      { error: "PO number is required" },
      { status: 400 },
    );
  }

  try {
    const organizationId = resolveClauseLibraryOrganizationId();
    const contractId =
      request.nextUrl.searchParams.get("contractId")?.trim() || undefined;
    const result = await lookupPoNumber(
      poNumber,
      organizationId,
      userEmail,
      contractId,
    );

    return NextResponse.json(result);
  } catch (error) {
    reportError(error, { route: "GET /api/po/lookup", poNumber });
    return NextResponse.json({ error: "PO lookup failed" }, { status: 500 });
  }
}
