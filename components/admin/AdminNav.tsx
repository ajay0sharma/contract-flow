"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { SignOutButton, useUser } from "@clerk/nextjs";

const navLinks = [
  { href: "/admin/dashboard", label: "Dashboard" },
  { href: "/search", label: "Search" },
];

const integrationLinks = [
  { href: "/admin/integrations", label: "Integrations" },
  { href: "/admin/email", label: "Email integration" },
  { href: "/admin/directory", label: "User directory" },
  { href: "/settings/po-integration", label: "PO integration" },
];

export function AdminNav() {
  const pathname = usePathname();
  const { user } = useUser();
  const displayName =
    user?.fullName ?? user?.primaryEmailAddress?.emailAddress ?? "Administrator";

  return (
    <aside className="flex w-full flex-col border-b border-stone-800/30 bg-stone-900 text-stone-100 lg:w-64 lg:border-b-0 lg:border-r">
      <div className="border-b border-stone-800/40 px-6 py-5">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-400/90">
          Platform Admin
        </p>
        <Link
          href="/admin/dashboard"
          className="mt-2 block text-lg font-semibold text-white"
        >
          Administrator
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
                  ? "bg-stone-800 text-white"
                  : "text-stone-300 hover:bg-stone-800/70 hover:text-white"
              }`}
            >
              {link.label}
            </Link>
          );
        })}

        <p className="mt-4 px-3 text-xs font-semibold uppercase tracking-[0.15em] text-amber-400/80">
          Integrations
        </p>
        {integrationLinks.map((link) => {
          const isActive =
            pathname === link.href || pathname.startsWith(`${link.href}/`);

          return (
            <Link
              key={link.href}
              href={link.href}
              className={`rounded-md px-3 py-2 text-sm font-medium ${
                isActive
                  ? "bg-stone-800 text-white"
                  : "text-stone-300 hover:bg-stone-800/70 hover:text-white"
              }`}
            >
              {link.label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-stone-800/40 p-4">
        <p className="text-xs text-stone-500">Signed in as</p>
        <p className="mt-1 text-sm font-medium text-white">{displayName}</p>
        <SignOutButton>
          <button
            type="button"
            className="mt-3 w-full rounded-md border border-stone-700 px-3 py-1.5 text-sm text-stone-200 hover:bg-stone-800"
          >
            Sign out
          </button>
        </SignOutButton>
      </div>
    </aside>
  );
}
