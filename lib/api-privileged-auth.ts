import { currentUser } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { isAdminEmail, isLegalEmail } from "@/lib/legal-access";
import { getUserDisplayName } from "@/lib/user-display-name";

export interface PrivilegedApiActor {
  email: string;
  name: string;
  userId: string;
}

export async function requireLegalOrAdminApiActor():
  Promise<{ actor: PrivilegedApiActor } | { response: NextResponse }> {
  const user = await currentUser();

  if (!user) {
    return {
      response: NextResponse.json({ error: "You must be signed in." }, { status: 401 }),
    };
  }

  const email = user.primaryEmailAddress?.emailAddress?.trim() ?? "";

  if (!email) {
    return {
      response: NextResponse.json({ error: "You must be signed in." }, { status: 401 }),
    };
  }

  if (!isLegalEmail(email) && !isAdminEmail(email)) {
    return {
      response: NextResponse.json({ error: "Forbidden." }, { status: 403 }),
    };
  }

  return {
    actor: {
      email,
      name: getUserDisplayName(user),
      userId: user.id,
    },
  };
}
