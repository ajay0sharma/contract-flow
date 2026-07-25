import { NextRequest, NextResponse } from "next/server";
import type { DirectoryProvider } from "@/lib/generated/prisma/enums";
import { testGoogleConnection } from "@/lib/directory-google";
import {
  testMicrosoftConnection,
  type MicrosoftCredentials,
} from "@/lib/directory-microsoft";
import {
  DIRECTORY_PROVIDERS,
  isRecord,
  requireAdminActor,
} from "@/lib/directory-route-utils";
import { reportError } from "@/lib/error-reporting";

interface DirectoryTestRequestBody {
  provider?: DirectoryProvider;
  credentials?: Record<string, string>;
}

function toMicrosoftCredentials(
  credentials: Record<string, string>,
): MicrosoftCredentials {
  return {
    tenantId: credentials.tenantId ?? "",
    clientId: credentials.clientId ?? "",
    clientSecret: credentials.clientSecret ?? "",
  };
}

export async function POST(request: NextRequest) {
  const auth = await requireAdminActor();

  if ("response" in auth) {
    return auth.response;
  }

  let body: DirectoryTestRequestBody;

  try {
    body = (await request.json()) as DirectoryTestRequestBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (!body.provider || !DIRECTORY_PROVIDERS.has(body.provider)) {
    return NextResponse.json({ error: "Invalid provider." }, { status: 400 });
  }

  if (!body.credentials || !isRecord(body.credentials)) {
    return NextResponse.json(
      { error: "credentials must be an object of string values." },
      { status: 400 },
    );
  }

  try {
    if (body.provider === "microsoft") {
      const result = await testMicrosoftConnection(
        toMicrosoftCredentials(body.credentials),
      );
      return NextResponse.json(result);
    }

    if (body.provider === "google") {
      const result = await testGoogleConnection({
        serviceAccountJson: body.credentials.serviceAccountJson ?? "",
        adminEmail: body.credentials.adminEmail ?? "",
        domain: body.credentials.domain ?? "",
      });
      return NextResponse.json(result);
    }

    return NextResponse.json(
      {
        success: false,
        userCount: 0,
        sampleUsers: [],
        error: "Manual provider does not support connection testing.",
      },
      { status: 400 },
    );
  } catch (error) {
    reportError(error, { route: "POST /api/directory/test" });

    const message =
      error instanceof Error
        ? error.message
        : "Directory connection test failed.";

    return NextResponse.json(
      {
        success: false,
        userCount: 0,
        sampleUsers: [],
        error: message,
      },
      { status: 500 },
    );
  }
}
