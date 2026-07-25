import { NextRequest, NextResponse } from "next/server";
import { requireLegalApiActor } from "@/lib/api-legal-auth";
import {
  createClause,
  isValidClauseCategory,
  listClauses,
} from "@/lib/clause-library-store";
import { resolveClauseLibraryOrganizationId } from "@/lib/clause-library-org";
import { safeTrim } from "@/lib/string-utils";
import {
  CLAUSE_STATUS_OPTIONS,
  type ActiveClauseStatus,
  type CreateClauseInput,
} from "@/types/clause-library";

function isActiveClauseStatus(value: string): value is ActiveClauseStatus {
  return CLAUSE_STATUS_OPTIONS.includes(value as ActiveClauseStatus);
}

function parseCreateInput(
  body: Record<string, unknown>,
  organizationId: string,
  createdById: string,
): { input?: CreateClauseInput; error?: string } {
  const title = safeTrim(String(body.title ?? ""));
  const category = safeTrim(String(body.category ?? ""));
  const preferredText = safeTrim(String(body.preferredText ?? ""));
  const status = safeTrim(String(body.status ?? ""));
  const contractTypes = Array.isArray(body.contractTypes)
    ? body.contractTypes
        .map((value) => safeTrim(String(value)))
        .filter(Boolean)
    : [];

  if (!title) {
    return { error: "Title is required." };
  }

  if (!category || !isValidClauseCategory(category)) {
    return { error: "Select a valid category." };
  }

  if (contractTypes.length === 0) {
    return { error: "Select at least one contract type." };
  }

  if (!preferredText) {
    return { error: "Preferred text is required." };
  }

  if (!isActiveClauseStatus(status)) {
    return { error: "Select a valid status." };
  }

  const alternativeText =
    body.alternativeText === undefined || body.alternativeText === null
      ? null
      : safeTrim(String(body.alternativeText));

  const notes =
    body.notes === undefined || body.notes === null
      ? null
      : safeTrim(String(body.notes));

  return {
    input: {
      organizationId,
      title,
      category,
      contractTypes,
      status,
      preferredText,
      alternativeText: alternativeText || null,
      notes: notes || null,
      createdById,
    },
  };
}

export async function GET() {
  const auth = await requireLegalApiActor();

  if ("response" in auth) {
    return auth.response;
  }

  const organizationId = resolveClauseLibraryOrganizationId();
  const clauses = await listClauses(organizationId);

  return NextResponse.json({ clauses, organizationId });
}

export async function POST(request: NextRequest) {
  const auth = await requireLegalApiActor();

  if ("response" in auth) {
    return auth.response;
  }

  const organizationId = resolveClauseLibraryOrganizationId();

  let body: Record<string, unknown>;

  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = parseCreateInput(body, organizationId, auth.actor.email);

  if (parsed.error || !parsed.input) {
    return NextResponse.json(
      { error: parsed.error ?? "Invalid clause payload." },
      { status: 400 },
    );
  }

  const clause = await createClause(parsed.input);
  return NextResponse.json({ clause }, { status: 201 });
}
