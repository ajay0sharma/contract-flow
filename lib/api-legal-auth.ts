import { currentUser } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { isLegalEmail } from "@/lib/legal-access";
import { getUserDisplayName } from "@/lib/user-display-name";

export interface LegalApiActor {
  email: string;
  name: string;
}

export async function requireLegalApiActor():
  Promise<{ actor: LegalApiActor } | { response: NextResponse }> {
  const user = await currentUser();

  if (!user) {
    return {
      response: NextResponse.json({ error: "You must be signed in." }, { status: 401 }),
    };
  }

  const email = user.primaryEmailAddress?.emailAddress ?? "";

  if (!isLegalEmail(email)) {
    return {
      response: NextResponse.json(
        { error: "Only legal users can access the clause library." },
        { status: 403 },
      ),
    };
  }

  return {
    actor: {
      email,
      name: getUserDisplayName(user),
    },
  };
}
