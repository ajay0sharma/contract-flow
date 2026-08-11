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
  | "mail"
  | "shield-lock"
  | "users-group"
  | "search"
  | "file-certificate";

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
        {
          href: "/legal/dashboard?view=signature",
          label: "Pending signature",
          icon: "file-certificate",
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
        { href: "/renewals", label: "Renewals", icon: "refresh" },
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
        {
          href: adminDashboardSectionHref("intake-form"),
          label: "Intake form",
          icon: "settings",
        },
        { href: "/admin/integrations", label: "Integrations", icon: "plug" },
        {
          href: adminDashboardSectionHref("workflow-policies"),
          label: "Policies",
          icon: "shield-lock",
        },
        { href: "/admin/directory", label: "Directory", icon: "users-group" },
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
