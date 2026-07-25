export const TIER_TOKENS = {
  general: {
    banner: "#F0F4F1",
    bannerBorder: "#C8D9CC",
    bannerText: "#2D4A35",
    bannerAccent: "#4A7C59",
    badgeBg: "#E4EDE7",
    badgeText: "#2D4A35",
    label: "General user",
    dotColor: "#4A7C59",
  },
  legal: {
    banner: "#F0F3F8",
    bannerBorder: "#C5D1E8",
    bannerText: "#1E3054",
    bannerAccent: "#3558A0",
    badgeBg: "#E2E9F5",
    badgeText: "#1E3054",
    label: "Legal user",
    dotColor: "#3558A0",
  },
  admin: {
    banner: "#F7F4EF",
    bannerBorder: "#DDD0BB",
    bannerText: "#3D2E1A",
    bannerAccent: "#8C6A35",
    badgeBg: "#F0E8D8",
    badgeText: "#3D2E1A",
    label: "Admin user",
    dotColor: "#8C6A35",
  },
} as const;

export type UserTier = keyof typeof TIER_TOKENS;

export type TierTokenSet = (typeof TIER_TOKENS)[UserTier];
