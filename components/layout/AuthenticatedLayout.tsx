"use client";

import { Suspense, useState, type ReactNode } from "react";
import { useDeferredEffect } from "@/lib/use-deferred-effect";
import { usePathname } from "next/navigation";
import { useUser } from "@clerk/nextjs";
import { AppShell } from "@/components/layout/AppShell";
import { BrandingProvider } from "@/components/providers/BrandingProvider";
import { TierProvider } from "@/components/providers/TierProvider";
import { getUserTier } from "@/lib/user-tier";

const PUBLIC_PATH_PREFIXES = ["/login", "/sign-up"];

interface AuthenticatedLayoutProps {
  children: ReactNode;
}

export function AuthenticatedLayout({ children }: AuthenticatedLayoutProps) {
  const pathname = usePathname();
  const { user, isLoaded } = useUser();
  const [hasMounted, setHasMounted] = useState(false);

  useDeferredEffect(() => {
    setHasMounted(true);
  }, []);

  const isPublicRoute = PUBLIC_PATH_PREFIXES.some((prefix) =>
    pathname.startsWith(prefix),
  );

  if (isPublicRoute || !isLoaded || !user || !hasMounted) {
    return <>{children}</>;
  }

  const email = user.primaryEmailAddress?.emailAddress ?? "";
  const tier = getUserTier(email);

  return (
    <TierProvider tier={tier}>
      <BrandingProvider>
        <Suspense fallback={<div className="min-h-screen bg-[#F9FAFB]" />}>
          <AppShell>{children}</AppShell>
        </Suspense>
      </BrandingProvider>
    </TierProvider>
  );
}
