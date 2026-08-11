import { NextRequest, NextResponse } from "next/server";
import { resolveClauseLibraryOrganizationId } from "@/lib/clause-library-org";
import { getTodayDateKey } from "@/lib/contract-expiration";
import { listMergedContractRecords } from "@/lib/contract-list-service";
import { reportError } from "@/lib/error-reporting";
import { requireLegalOrAdminApiActor } from "@/lib/api-privileged-auth";
import {
  applyRenewalSettingsToRecord,
  listRenewalQueue,
  type RenewalQueueFilters,
} from "@/lib/renewal-workflow";
import type { RenewalStatus } from "@/types/contract";

function parseRenewalFilters(
  searchParams: URLSearchParams,
): RenewalQueueFilters {
  const windowDays = Number.parseInt(searchParams.get("window") ?? "90", 10);
  const status = searchParams.get("status") ?? "all";
  const autoRenewal = searchParams.get("autoRenewal") ?? "all";

  return {
    windowDays: Number.isFinite(windowDays) ? windowDays : 90,
    status:
      status === "all" ? "all" : (status as RenewalStatus),
    autoRenewal:
      autoRenewal === "yes" || autoRenewal === "no" ? autoRenewal : "all",
  };
}

export async function GET(request: NextRequest) {
  const auth = await requireLegalOrAdminApiActor();

  if ("response" in auth) {
    return auth.response;
  }

  try {
    const organizationId = resolveClauseLibraryOrganizationId();
    const contracts = await listMergedContractRecords(organizationId);
    const normalizedContracts = contracts.map(applyRenewalSettingsToRecord);
    const filters = parseRenewalFilters(request.nextUrl.searchParams);
    const renewals = listRenewalQueue(
      normalizedContracts,
      filters,
      getTodayDateKey(),
    );

    return NextResponse.json({
      renewals,
      organizationId,
      today: getTodayDateKey(),
      filters,
    });
  } catch (error) {
    reportError(error, { route: "GET /api/legal/renewals" });
    return NextResponse.json(
      { error: "Failed to load renewal queue." },
      { status: 500 },
    );
  }
}
