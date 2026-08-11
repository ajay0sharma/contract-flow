import { currentUser } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import {
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  searchVisibleContractRecords,
} from "@/lib/contract-search-service";
import { reportError } from "@/lib/error-reporting";

function parsePositiveInt(
  value: string | null,
  fallback: number,
  max?: number,
): number {
  const parsed = Number.parseInt(value ?? "", 10);

  if (!Number.isFinite(parsed) || parsed < 1) {
    return fallback;
  }

  if (max !== undefined) {
    return Math.min(parsed, max);
  }

  return parsed;
}

export async function GET(request: NextRequest) {
  const user = await currentUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const actorEmail = user.primaryEmailAddress?.emailAddress?.trim() ?? "";

  if (!actorEmail) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    const { searchParams } = request.nextUrl;
    const q = searchParams.get("q")?.trim() || undefined;

    const result = await searchVisibleContractRecords(actorEmail, {
      q,
      stage: searchParams.get("stage")?.trim() || undefined,
      contractType: searchParams.get("contractType")?.trim() || undefined,
      companyName: searchParams.get("companyName")?.trim() || undefined,
      page: parsePositiveInt(searchParams.get("page"), 1),
      pageSize: parsePositiveInt(
        searchParams.get("pageSize"),
        DEFAULT_PAGE_SIZE,
        MAX_PAGE_SIZE,
      ),
    });

    return NextResponse.json(result);
  } catch (error) {
    reportError(error, { route: "GET /api/contracts/search" });
    return NextResponse.json(
      { error: "Failed to search contracts." },
      { status: 500 },
    );
  }
}
