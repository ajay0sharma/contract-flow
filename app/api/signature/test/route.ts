import { NextRequest, NextResponse } from "next/server";
import type { SignatureProvider } from "@/lib/generated/prisma/enums";
import { requireAdminOrganizationActor } from "@/lib/admin-organization-api";
import { reportError } from "@/lib/error-reporting";
import {
  getSignatureConfigCredentials,
  getSignatureIntegrationConfig,
  recordSignatureIntegrationTestResult,
} from "@/lib/signature-integration";
import { testSignatureProviderConnection } from "@/lib/signature-providers";

interface SignatureTestRequestBody {
  provider?: SignatureProvider;
  displayName?: string;
  accountId?: string | null;
  baseUrl?: string | null;
  credentials?: Record<string, string>;
  useStoredCredentials?: boolean;
}

export async function POST(request: NextRequest) {
  const auth = await requireAdminOrganizationActor(request);

  if ("response" in auth) {
    return auth.response;
  }

  let body: SignatureTestRequestBody;

  try {
    body = (await request.json()) as SignatureTestRequestBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  try {
    const storedConfig = await getSignatureIntegrationConfig(
      auth.organizationId,
    );
    const provider = body.provider ?? storedConfig.provider;
    const credentials = body.useStoredCredentials
      ? await getSignatureConfigCredentials(auth.organizationId)
      : (body.credentials ?? {});

    const result = await testSignatureProviderConnection({
      provider,
      displayName: body.displayName?.trim() || storedConfig.displayName,
      accountId: body.accountId ?? storedConfig.accountId,
      baseUrl: body.baseUrl ?? storedConfig.baseUrl,
      credentials,
    });

    await recordSignatureIntegrationTestResult(auth.organizationId, result);

    return NextResponse.json(result);
  } catch (error) {
    reportError(error, { route: "POST /api/signature/test" });
    return NextResponse.json(
      {
        success: false,
        message: "E-signature connection test failed.",
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
