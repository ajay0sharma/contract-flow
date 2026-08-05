"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { SignOutButton, useUser } from "@clerk/nextjs";
import { useEffect, useMemo, useRef, useState } from "react";
import { useDeferredEffect } from "@/lib/use-deferred-effect";
import { NavIcon } from "@/components/layout/NavIcon";
import { AppHeaderBrand, useBranding } from "@/components/providers/BrandingProvider";
import { useTier } from "@/components/providers/TierProvider";
import { getHomePathForEmail } from "@/lib/legal-access";
import { adminDashboardSectionHref } from "@/lib/admin-dashboard-sections";
import { getNavigationSections } from "@/lib/navigation-config";
import { getPersonInitials } from "@/lib/person-display";

interface AppShellProps {
  children: React.ReactNode;
}

function isLinkActive(
  pathname: string,
  searchParams: URLSearchParams,
  href: string,
): boolean {
  const [path, queryString] = href.split("?");
  const pathMatches =
    pathname === path || pathname.startsWith(`${path}/`);

  if (!pathMatches) {
    return false;
  }

  if (!queryString) {
    if (path === "/legal/dashboard") {
      const view = searchParams.get("view");
      return !view || view === "pending";
    }

    if (path === "/admin/dashboard") {
      return !searchParams.get("section");
    }

    return pathname === path;
  }

  const expected = new URLSearchParams(queryString);

  for (const [key, value] of expected.entries()) {
    if (searchParams.get(key) !== value) {
      return false;
    }
  }

  if (path === "/legal/dashboard" && expected.get("view") === "pending") {
    const view = searchParams.get("view");
    return view === "pending" || view === null;
  }

  return true;
}

export function AppShell({ children }: AppShellProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { user } = useUser();
  const { tier, tokens } = useTier();
  const [hasMounted, setHasMounted] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const menuRef = useRef<HTMLDivElement>(null);

  useDeferredEffect(() => {
    setHasMounted(true);
  }, []);

  useDeferredEffect(() => {
    setMobileNavOpen(false);
  }, [pathname, searchParams]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent): void {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (!hasMounted || !user) {
      return;
    }

    const endpoint =
      tier === "legal"
        ? "/api/legal/contracts?view=pending&pageSize=1"
        : "/api/contracts?assignedToMe=true";

    void fetch(endpoint, { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) {
          return null;
        }

        return response.json();
      })
      .then((data) => {
        if (!data) {
          return;
        }

        if (Array.isArray(data)) {
          setPendingCount(data.length);
          return;
        }

        if (typeof data === "object" && data && "contracts" in data) {
          const payload = data as { contracts: unknown[]; pagination?: { totalCount?: number } };
          setPendingCount(
            payload.pagination?.totalCount ?? payload.contracts.length,
          );
        }
      })
      .catch(() => {
        setPendingCount(0);
      });
  }, [hasMounted, tier, user]);

  const email = hasMounted
    ? user?.primaryEmailAddress?.emailAddress ?? ""
    : "";
  const firstName =
    user?.firstName?.trim() ||
    user?.fullName?.trim().split(/\s+/)[0] ||
    "User";
  const displayName = hasMounted
    ? user?.fullName ?? user?.primaryEmailAddress?.emailAddress ?? "User"
    : "User";
  const initials = getPersonInitials(displayName);
  const homePath = hasMounted ? getHomePathForEmail(email) : "/dashboard";
  const sections = hasMounted ? getNavigationSections(email) : [];

  const { branding } = useBranding();
  const headerAccent = branding.accentColor ?? tokens.bannerAccent;

  const avatarStyle = useMemo(
    () => ({
      backgroundColor: `${headerAccent}26`,
      color: headerAccent,
    }),
    [headerAccent],
  );

  function renderNavLinks(onNavigate?: () => void) {
    return sections.map((section, sectionIndex) => (
      <div key={section.label ?? `section-${sectionIndex}`}>
        {section.label ? (
          <p className="px-4 pb-1 pt-4 text-xs font-semibold uppercase tracking-wider text-gray-400">
            {section.label}
          </p>
        ) : null}
        {section.links.map((link) => {
          const active = isLinkActive(pathname, searchParams, link.href);

          return (
            <Link
              key={`${link.href}-${link.label}`}
              href={link.href}
              onClick={onNavigate}
              className="mx-2 flex items-center gap-3 rounded-lg px-4 py-2.5 text-sm transition-colors hover:bg-gray-50 hover:text-gray-900"
              style={
                active
                  ? {
                      backgroundColor: tokens.badgeBg,
                      color: tokens.bannerText,
                      fontWeight: 500,
                    }
                  : { color: "#4B5563" }
              }
            >
              <NavIcon name={link.icon} />
              {link.label}
            </Link>
          );
        })}
      </div>
    ));
  }

  return (
    <div className="min-h-screen bg-[#F9FAFB]">
      <header className="sticky top-0 z-50 flex h-14 items-center justify-between border-b border-gray-200 bg-white px-4 lg:px-6">
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="rounded-lg p-2 text-gray-600 hover:bg-gray-50 lg:hidden"
            aria-label="Open navigation menu"
            onClick={() => setMobileNavOpen(true)}
          >
            <svg
              aria-hidden
              viewBox="0 0 24 24"
              className="h-6 w-6"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
            >
              <path d="M4 7h16M4 12h16M4 17h16" />
            </svg>
          </button>
          <AppHeaderBrand accentColor={headerAccent} homePath={homePath} />
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            className="relative rounded-lg p-2 text-gray-500 hover:bg-gray-50"
            aria-label="Notifications"
          >
            <NavIcon name="bell" className="h-6 w-6" />
            {pendingCount > 0 ? (
              <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-red-500" />
            ) : null}
          </button>

          <span
            className="hidden items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium sm:flex"
            style={{
              backgroundColor: tokens.badgeBg,
              color: tokens.badgeText,
            }}
          >
            <span
              className="h-1.5 w-1.5 rounded-full"
              style={{ backgroundColor: tokens.dotColor }}
            />
            {tokens.label}
          </span>

          <div className="relative" ref={menuRef}>
            <button
              type="button"
              onClick={() => setMenuOpen((open) => !open)}
              className="flex items-center gap-2 rounded-lg px-2 py-1 hover:bg-gray-50"
            >
              <span className="hidden text-sm text-gray-700 sm:inline">
                {firstName}
              </span>
              <span
                className="flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold"
                style={avatarStyle}
              >
                {initials}
              </span>
              <NavIcon name="chevron-down" className="h-4 w-4 text-gray-400" />
            </button>

            {menuOpen ? (
              <div className="absolute right-0 mt-2 w-44 rounded-xl border border-gray-100 bg-white py-1 shadow-lg">
                <Link
                  href={homePath}
                  className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                  onClick={() => setMenuOpen(false)}
                >
                  Profile
                </Link>
                <Link
                  href={
                    tier === "admin"
                      ? adminDashboardSectionHref("user-settings")
                      : tier === "legal"
                        ? "/settings/templates"
                        : "/dashboard"
                  }
                  className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                  onClick={() => setMenuOpen(false)}
                >
                  Settings
                </Link>
                <SignOutButton>
                  <button
                    type="button"
                    className="block w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"
                  >
                    Sign out
                  </button>
                </SignOutButton>
              </div>
            ) : null}
          </div>
        </div>
      </header>

      {mobileNavOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-slate-900/40"
            aria-label="Close navigation menu"
            onClick={() => setMobileNavOpen(false)}
          />
          <aside className="relative flex h-full w-[260px] max-w-[85vw] flex-col border-r border-gray-100 bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
              <span className="text-sm font-semibold text-gray-900">Menu</span>
              <button
                type="button"
                className="rounded-lg p-2 text-gray-500 hover:bg-gray-50"
                aria-label="Close navigation menu"
                onClick={() => setMobileNavOpen(false)}
              >
                <NavIcon name="x" className="h-5 w-5" />
              </button>
            </div>
            <div
              className="flex h-9 items-center justify-center gap-1.5 border-b text-xs font-medium"
              style={{
                backgroundColor: tokens.banner,
                borderColor: tokens.bannerBorder,
                color: tokens.bannerText,
              }}
            >
              <span
                className="h-1.5 w-1.5 rounded-full"
                style={{ backgroundColor: tokens.dotColor }}
              />
              {tokens.label}
            </div>
            <nav className="flex-1 overflow-y-auto py-3">
              {renderNavLinks(() => setMobileNavOpen(false))}
            </nav>
          </aside>
        </div>
      ) : null}

      <div className="flex">
        <aside className="sticky top-14 hidden h-[calc(100vh-3.5rem)] w-[220px] shrink-0 border-r border-gray-100 bg-white lg:flex lg:flex-col">
          <div
            className="flex h-9 items-center justify-center gap-1.5 border-b text-xs font-medium"
            style={{
              backgroundColor: tokens.banner,
              borderColor: tokens.bannerBorder,
              color: tokens.bannerText,
            }}
          >
            <span
              className="h-1.5 w-1.5 rounded-full"
              style={{ backgroundColor: tokens.dotColor }}
            />
            {tokens.label}
          </div>

          <nav className="flex-1 overflow-y-auto py-3">
            {renderNavLinks()}
          </nav>
        </aside>

        <main className="min-w-0 flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}
