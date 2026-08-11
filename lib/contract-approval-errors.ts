import { NextResponse } from "next/server";

export function mapContractWorkflowActionError(
  error: unknown,
): NextResponse | null {
  if (!(error instanceof Error)) {
    return null;
  }

  const message = error.message;

  if (message === "Contract not found.") {
    return NextResponse.json({ error: message }, { status: 404 });
  }

  if (
    message.includes("not assigned") ||
    message.includes("No pending approval step") ||
    message.includes("not been picked up") ||
    message.includes("not configured as a legal reviewer") ||
    message.includes("not awaiting approval")
  ) {
    return NextResponse.json({ error: message }, { status: 403 });
  }

  if (message.includes("required")) {
    return NextResponse.json({ error: message }, { status: 400 });
  }

  return null;
}
