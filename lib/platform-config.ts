export type PlatformRole = "admin" | "legal" | "support" | "business";

export interface PlatformUser {
  email: string;
  name: string;
  role: PlatformRole;
  createdAt: string;
}

function parseAdminEmails(): string[] {
  const fromEnv = process.env.ADMIN_EMAILS;

  if (fromEnv) {
    return fromEnv.split(",").map((email) => email.trim()).filter(Boolean);
  }

  return ["admin@example.com"];
}

export const platformConfig = {
  adminEmails: parseAdminEmails(),
};

export function getAdminEmails(): string[] {
  return platformConfig.adminEmails;
}
