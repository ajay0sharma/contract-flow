import { NextRequest, NextResponse } from "next/server";
import { requireLegalApiActor } from "@/lib/api-legal-auth";
import {
  archiveClause,
  getClauseById,
  isValidClauseCategory,
  updateClause,
} from "@/lib/clause-library-store";
import { resolveClauseLibraryOrganizationId } from "@/lib/clause-library-org";
import { safeTrim } from "@/lib/string-utils";
import {
  CLAUSE_STATUS_OPTIONS,
  type ActiveClauseStatus,
  type UpdateClauseInput,
} from "@/types/clause-library";

function isActiveClauseStatus(value: string): value is ActiveClauseStatus {
  return CLAUSE_STATUS_OPTIONS.includes(value as ActiveClauseStatus);
}

function parseUpdateInput(
  body: Record<string, unknown>,
): { input?: UpdateClauseInput; error?: string } {
  const input: UpdateClauseInput = {};

  if (body.title !== undefined) {
    const title = safeTrim(String(body.title));

    if (!title) {
      return { error: "Title cannot be empty." };
    }

    input.title = title;
  }

  if (body.category !== undefined) {
    const category = safeTrim(String(body.category));

    if (!category || !isValidClauseCategory(category)) {
      return { error: "Select a valid category." };
    }

    input.category = category;
  }

  if (body.contractTypes !== undefined) {
    const contractTypes = Array.isArray(body.contractTypes)
      ? body.contractTypes
          .map((value) => safeTrim(String(value)))
          .filter(Boolean)
      : [];

    if (contractTypes.length === 0) {
      return { error: "Select at least one contract type." };
    }

    input.contractTypes = contractTypes;
  }

  if (body.status !== undefined) {
    const status = safeTrim(String(body.status));

    if (!isActiveClauseStatus(status)) {
      return { error: "Select a valid status." };
    }

    input.status = status;
  }

  if (body.preferredText !== undefined) {
    const preferredText = safeTrim(String(body.preferredText));

    if (!preferredText) {
      return { error: "Preferred text cannot be empty." };
    }

    input.preferredText = preferredText;
  }

  if (body.alternativeText !== undefined) {
    input.alternativeText =
      body.alternativeText === null
        ? null
        : safeTrim(String(body.alternativeText)) || null;
  }

  if (body.notes !== undefined) {
    input.notes =
      body.notes === null ? null : safeTrim(String(body.notes)) || null;
  }

  if (Object.keys(input).length === 0) {
    return { error: "No valid fields provided for update." };
  }

  return { input };
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await requireLegalApiActor();

  if ("response" in auth) {
    return auth.response;
  }

  const organizationId = resolveClauseLibraryOrganizationId();
  const { id } = await context.params;
  const existing = await getClauseById(id, organizationId);

  if (!existing) {
    return NextResponse.json({ error: "Clause not found." }, { status: 404 });
  }

  let body: Record<string, unknown>;

  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = parseUpdateInput(body);

  if (parsed.error || !parsed.input) {
    return NextResponse.json(
      { error: parsed.error ?? "Invalid clause payload." },
      { status: 400 },
    );
  }

  const clause = await updateClause(id, organizationId, parsed.input);

  if (!clause) {
    return NextResponse.json({ error: "Clause not found." }, { status: 404 });
  }

  return NextResponse.json({ clause });
}

export async function DELETE(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await requireLegalApiActor();

  if ("response" in auth) {
    return auth.response;
  }

  const organizationId = resolveClauseLibraryOrganizationId();
  const { id } = await context.params;
  const existing = await getClauseById(id, organizationId);

  if (!existing) {
    return NextResponse.json({ error: "Clause not found." }, { status: 404 });
  }

  const clause = await archiveClause(id, organizationId);

  if (!clause) {
    return NextResponse.json({ error: "Clause not found." }, { status: 404 });
  }

  return NextResponse.json({ clause });
}
