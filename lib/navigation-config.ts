import type { UserTier } from "@/lib/design-tokens";
import { adminDashboardSectionHref } from "@/lib/admin-dashboard-sections";
import {
  isAdminEmail,
  isLegalEmail,
  isSupportEmail,
} from "@/lib/legal-access";

export type NavIconName =
  | "layout-dashboard"
  | "plus"
  | "files"
  | "settings"
  | "help-circle"
  | "clock"
  | "calendar"
  | "refresh"
  | "chart-bar"
  | "shield"
  | "checklist"
  | "template"
  | "library"
  | "users"
  | "building"
  | "git-branch"
  | "plug"
  | "shield-lock"
  | "users-group"
  | "search";

export interface NavLinkItem {
  href: string;
  label: string;
  icon: NavIconName;
}

export interface NavSection {
  label?: string;
  links: NavLinkItem[];
}

const SUPPORT_NAVIGATION: NavSection[] = [
  {
    links: [
      { href: "/dashboard", label: "Dashboard", icon: "layout-dashboard" },
      { href: "/search", label: "Search", icon: "search" },
    ],
  },
];

export const NAVIGATION_BY_TIER: Record<UserTier, NavSection[]> = {
  general: [
    {
      links: [
        { href: "/dashboard", label: "Dashboard", icon: "layout-dashboard" },
        { href: "/contracts/new", label: "New request", icon: "plus" },
        { href: "/search", label: "My requests", icon: "files" },
      ],
    },
    {
      label: "Account",
      links: [
        { href: "/dashboard", label: "Settings", icon: "settings" },
        { href: "/dashboard", label: "Help", icon: "help-circle" },
      ],
    },
  ],
  legal: [
    {
      links: [
        { href: "/legal/dashboard", label: "Dashboard", icon: "layout-dashboard" },
        {
          href: "/legal/dashboard?view=all",
          label: "Contract database",
          icon: "files",
        },
        {
          href: "/legal/dashboard?view=pending",
          label: "Pending review",
          icon: "clock",
        },
        { href: "/calendar", label: "Calendar", icon: "calendar" },
        { href: "/renewals", label: "Renewals", icon: "refresh" },
        { href: "/search", label: "Search", icon: "search" },
      ],
    },
    {
      label: "Tools",
      links: [
        { href: "/legal/reports", label: "Reports", icon: "chart-bar" },
        { href: "/legal/risk", label: "Risk dashboard", icon: "shield" },
        { href: "/legal/obligations", label: "Obligations", icon: "checklist" },
      ],
    },
    {
      label: "Settings",
      links: [
        { href: "/settings/templates", label: "Templates", icon: "template" },
        {
          href: "/settings/clause-library",
          label: "Clause library",
          icon: "library",
        },
        { href: "/legal/dashboard?view=intake", label: "Intake settings", icon: "settings" },
        {
          href: "/legal/workflow-settings",
          label: "Workflow settings",
          icon: "git-branch",
        },
      ],
    },
  ],
  admin: [
    {
      links: [
        { href: "/admin/dashboard", label: "Dashboard", icon: "layout-dashboard" },
        {
          href: "/legal/dashboard?view=all",
          label: "All contracts",
          icon: "files",
        },
        { href: "/calendar", label: "Calendar", icon: "calendar" },
        { href: adminDashboardSectionHref("user-settings"), label: "Users", icon: "users" },
        { href: "/admin/organization", label: "Organization", icon: "building" },
        { href: "/search", label: "Search", icon: "search" },
      ],
    },
    {
      label: "Configuration",
      links: [
        { href: "/settings/templates", label: "Templates", icon: "template" },
        {
          href: adminDashboardSectionHref("workflow-settings"),
          label: "Workflow rules",
          icon: "git-branch",
        },
        { href: "/admin/integrations", label: "Integrations", icon: "plug" },
        {
          href: adminDashboardSectionHref("workflow-policies"),
          label: "Policies",
          icon: "shield-lock",
        },
        { href: "/settings/directory", label: "Directory", icon: "users-group" },
      ],
    },
    {
      label: "Account",
      links: [
        { href: "/admin/settings", label: "Settings", icon: "settings" },
        { href: "/admin/settings", label: "Help", icon: "help-circle" },
      ],
    },
  ],
};

export function getNavigationSections(email: string): NavSection[] {
  if (isAdminEmail(email)) {
    return NAVIGATION_BY_TIER.admin;
  }

  if (isSupportEmail(email)) {
    return SUPPORT_NAVIGATION;
  }

  if (isLegalEmail(email)) {
    return NAVIGATION_BY_TIER.legal;
  }

  return NAVIGATION_BY_TIER.general;
}
