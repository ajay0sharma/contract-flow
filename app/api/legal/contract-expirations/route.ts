import { NextResponse } from "next/server";
import { resolveClauseLibraryOrganizationId } from "@/lib/clause-library-org";
import {
  getTodayDateKey,
  toContractExpirationEntry,
  type ContractExpirationEntry,
} from "@/lib/contract-expiration";
import { listMergedContractRecords } from "@/lib/contract-list-service";
import { reportError } from "@/lib/error-reporting";
import { requireLegalOrAdminApiActor } from "@/lib/api-privileged-auth";

export async function GET() {
  const auth = await requireLegalOrAdminApiActor();

  if ("response" in auth) {
    return auth.response;
  }

  try {
    const organizationId = resolveClauseLibraryOrganizationId();
    const contracts = await listMergedContractRecords(organizationId);
    const todayKey = getTodayDateKey();
    const expirations = contracts
      .map((contract) => toContractExpirationEntry(contract, todayKey))
      .filter((entry): entry is ContractExpirationEntry => entry !== null)
      .sort((left, right) => {
        if (left.expirationDate !== right.expirationDate) {
          return left.expirationDate.localeCompare(right.expirationDate);
        }

        return left.recordNumber.localeCompare(right.recordNumber);
      });

    return NextResponse.json({
      expirations,
      organizationId,
      today: todayKey,
    });
  } catch (error) {
    reportError(error, { route: "GET /api/legal/contract-expirations" });
    return NextResponse.json(
      { error: "Failed to load contract expirations." },
      { status: 500 },
    );
  }
}
