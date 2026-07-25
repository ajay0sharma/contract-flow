"use client";

import {
  createContext,
  useContext,
  useMemo,
  type ReactNode,
} from "react";
import { TIER_TOKENS, type TierTokenSet, type UserTier } from "@/lib/design-tokens";
import { getTierTokens } from "@/lib/user-tier";

interface TierContextValue {
  tier: UserTier;
  tokens: TierTokenSet;
}

const TierContext = createContext<TierContextValue | null>(null);

export function TierProvider({
  children,
  tier,
}: {
  children: ReactNode;
  tier: UserTier;
}) {
  const value = useMemo(
    () => ({
      tier,
      tokens: getTierTokens(tier),
    }),
    [tier],
  );

  return (
    <TierContext.Provider value={value}>{children}</TierContext.Provider>
  );
}

export function useTier(): TierContextValue {
  const context = useContext(TierContext);

  if (!context) {
    return {
      tier: "general",
      tokens: TIER_TOKENS.general,
    };
  }

  return context;
}
