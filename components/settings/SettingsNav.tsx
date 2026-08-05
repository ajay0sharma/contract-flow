"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useUser } from "@clerk/nextjs";
import { useState } from "react";
import { useDeferredEffect } from "@/lib/use-deferred-effect";
import { useTier } from "@/components/providers/TierProvider";
import { isAdminEmail } from "@/lib/legal-access";

const navLinks = [
  { href: "/settings/clause-library", label: "Clause library" },
  { href: "/settings/templates", label: "Contract templates" },
];

const integrationLinks = [
  { href: "/admin/email", label: "Email integration" },
  { href: "/admin/directory", label: "User directory" },
  { href: "/settings/po-integration", label: "PO integration" },
];

const adminLinks = [
  { href: "/settings/workflow", label: "Workflow settings" },
];

export function SettingsNav({
  isAdmin = false,
  compact = false,
}: {
  isAdmin?: boolean;
  compact?: boolean;
}) {
  const pathname = usePathname();
  const { user } = useUser();
  const { tokens } = useTier();
  const [hasMounted, setHasMounted] = useState(false);

  useDeferredEffect(() => {
    setHasMounted(true);
  }, []);

  const email = hasMounted
    ? user?.primaryEmailAddress?.emailAddress ?? ""
    : "";
  const showAdminLinks =
    isAdmin || (hasMounted ? isAdminEmail(email) : false);

  function renderLink(href: string, label: string) {
    const isActive =
      pathname === href || pathname.startsWith(`${href}/`);

    return (
      <Link
        key={href}
        href={href}
        className={`block shrink-0 rounded-lg px-3 py-2 text-sm transition-colors hover:bg-gray-50 hover:text-gray-900 ${
          compact ? "whitespace-nowrap lg:whitespace-normal" : ""
        }`}
        style={
          isActive
            ? {
                backgroundColor: tokens.badgeBg,
                color: tokens.bannerText,
                fontWeight: 500,
              }
            : { color: "#4B5563" }
        }
      >
        {label}
      </Link>
    );
  }

  return (
    <nav
      className={
        compact
          ? "flex gap-1 overflow-x-auto pb-1 lg:block lg:space-y-1 lg:overflow-visible lg:pb-0"
          : "flex flex-col gap-1 p-4"
      }
    >
      <p className="px-3 pb-2 text-xs font-semibold uppercase tracking-wider text-gray-400">
        Content
      </p>
      {navLinks.map((link) => renderLink(link.href, link.label))}

      {showAdminLinks ? (
        <>
          <p className="px-3 pb-2 pt-4 text-xs font-semibold uppercase tracking-wider text-gray-400">
            Integrations
          </p>
          {integrationLinks.map((link) => renderLink(link.href, link.label))}
          <p className="px-3 pb-2 pt-4 text-xs font-semibold uppercase tracking-wider text-gray-400">
            Administration
          </p>
          {adminLinks.map((link) => renderLink(link.href, link.label))}
        </>
      ) : null}
    </nav>
  );
}
