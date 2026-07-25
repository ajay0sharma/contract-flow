import { TIER_TOKENS, type UserTier } from "@/lib/design-tokens";
import { isAdminEmail, isLegalEmail } from "@/lib/legal-access";

export type { UserTier };

export function getUserTier(email: string): UserTier {
  if (isAdminEmail(email)) {
    return "admin";
  }

  if (isLegalEmail(email)) {
    return "legal";
  }

  return "general";
}

export function getTierTokens(tier: UserTier) {
  return TIER_TOKENS[tier];
}
