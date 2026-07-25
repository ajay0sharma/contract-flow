"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { SignOutButton, useUser } from "@clerk/nextjs";

const navLinks = [
  { href: "/legal/dashboard", label: "Legal Dashboard" },
  { href: "/search", label: "Search" },
  { href: "/legal/reports", label: "Reports" },
  { href: "/settings/clause-library", label: "Clause library" },
  { href: "/settings/templates", label: "Contract templates" },
  { href: "/dashboard", label: "Business Portal" },
];

export function LegalNav() {
  const pathname = usePathname();
  const { user } = useUser();
  const displayName =
    user?.fullName ?? user?.primaryEmailAddress?.emailAddress ?? "User";

  return (
    <aside className="flex w-full flex-col border-b border-indigo-900/20 bg-indigo-950 text-indigo-50 lg:w-64 lg:border-b-0 lg:border-r">
      <div className="border-b border-indigo-900/30 px-6 py-5">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-indigo-300">
          Legal Department
        </p>
        <Link
          href="/legal/dashboard"
          className="mt-2 block text-lg font-semibold text-white"
        >
          Legal Workspace
        </Link>
      </div>

      <nav className="flex flex-1 flex-col gap-1 p-4">
        {navLinks.map((link) => {
          const isActive =
            pathname === link.href || pathname.startsWith(`${link.href}/`);

          return (
            <Link
              key={link.href}
              href={link.href}
              className={`rounded-md px-3 py-2 text-sm font-medium ${
                isActive
                  ? "bg-indigo-800 text-white"
                  : "text-indigo-100 hover:bg-indigo-900 hover:text-white"
              }`}
            >
              {link.label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-indigo-900/30 p-4">
        <p className="text-xs text-indigo-300">Signed in as</p>
        <p className="mt-1 text-sm font-medium text-white">{displayName}</p>
        <SignOutButton>
          <button
            type="button"
            className="mt-3 w-full rounded-md border border-indigo-700 px-3 py-1.5 text-sm text-indigo-100 hover:bg-indigo-900"
          >
            Sign out
          </button>
        </SignOutButton>
      </div>
    </aside>
  );
}
