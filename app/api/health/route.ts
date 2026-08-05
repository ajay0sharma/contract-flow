import { NextResponse } from "next/server";
import { runHealthChecks } from "@/lib/health-check";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const { result, httpStatus } = await runHealthChecks();
  return NextResponse.json(result, { status: httpStatus });
}
