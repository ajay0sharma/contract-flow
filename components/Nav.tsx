"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { SignOutButton, useUser } from "@clerk/nextjs";
import { useMemo, useState } from "react";
import { useDeferredEffect } from "@/lib/use-deferred-effect";
import {
  getHomePathForEmail,
  isAdminEmail,
  isLegalEmail,
  isSupportEmail,
} from "@/lib/legal-access";

const businessNavLinks = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/search", label: "Search" },
  { href: "/contracts/new", label: "New Contract" },
  { href: "/contracts/ctr-1042", label: "View Contract" },
  { href: "/contracts/ctr-1042/review", label: "Review" },
];

const legalNavLinks = [
  { href: "/legal/dashboard", label: "Legal Workspace" },
  { href: "/search", label: "Search" },
  { href: "/legal/reports", label: "Reports" },
];

const adminNavLinks = [{
  href: "/admin/dashboard",
  label: "Platform Admin",
}, {
  href: "/search",
  label: "Search",
}];

const supportNavLinks = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/search", label: "Search" },
];

export function Nav() {
  const pathname = usePathname();
  const { user } = useUser();
  const [hasMounted, setHasMounted] = useState(false);

  useDeferredEffect(() => {
    setHasMounted(true);
  }, []);

  const email = hasMounted
    ? user?.primaryEmailAddress?.emailAddress ?? ""
    : "";
  const displayName = hasMounted
    ? user?.fullName ?? user?.primaryEmailAddress?.emailAddress ?? "User"
    : "User";
  const isAdmin = hasMounted ? isAdminEmail(email) : false;
  const isLegalOnly = hasMounted ? isLegalEmail(email) && !isAdmin : false;
  const isSupport = hasMounted ? isSupportEmail(email) : false;
  const navLinks = useMemo(() => {
    if (isAdmin) {
      return adminNavLinks;
    }

    if (isSupport) {
      return supportNavLinks;
    }

    const baseLinks = isLegalOnly ? legalNavLinks : businessNavLinks;

    return baseLinks;
  }, [isAdmin, isLegalOnly, isSupport]);
  const homePath = hasMounted ? getHomePathForEmail(email) : "/dashboard";
  const workspaceTitle = isAdmin
    ? "Platform Admin"
    : isLegalOnly
      ? "Legal Workspace"
      : isSupport
        ? "Support Workspace"
        : "Contract App";

  return (
    <header className="border-b border-border bg-surface shadow-sm">
      <div className="mx-auto flex max-w-5xl flex-col gap-4 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
        <Link href={homePath} className="text-lg font-semibold text-foreground">
          {workspaceTitle}
        </Link>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <nav className="flex flex-wrap gap-2">
            {navLinks.map((link) => {
              const isActive =
                pathname === link.href ||
                pathname.startsWith(`${link.href}/`);

              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`rounded-md px-3 py-1.5 text-sm font-medium ${
                    isActive
                      ? "bg-accent text-white"
                      : "text-text-secondary hover:bg-surface-muted hover:text-foreground"
                  }`}
                >
                  {link.label}
                </Link>
              );
            })}
          </nav>
          <div className="flex items-center gap-3 border-t border-border pt-4 sm:border-t-0 sm:pt-0">
            <span className="text-sm font-medium text-text-secondary">
              {displayName}
            </span>
            <SignOutButton>
              <button
                type="button"
                className="rounded-md border border-border bg-surface px-3 py-1.5 text-sm font-medium text-text-secondary hover:bg-surface-muted"
              >
                Sign out
              </button>
            </SignOutButton>
          </div>
        </div>
      </div>
    </header>
  );
}
