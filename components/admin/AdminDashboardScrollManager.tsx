"use client";

import { useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { isAdminDashboardSection } from "@/lib/admin-dashboard-sections";

function scrollToSection(sectionId: string): void {
  const target = document.getElementById(sectionId);

  if (!target) {
    return;
  }

  target.scrollIntoView({ behavior: "smooth", block: "start" });
}

export function AdminDashboardScrollManager() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (pathname !== "/admin/dashboard") {
      return;
    }

    const sectionFromQuery = searchParams.get("section");
    const sectionFromHash =
      typeof window !== "undefined" ? window.location.hash.slice(1) : "";
    const sectionId = isAdminDashboardSection(sectionFromQuery)
      ? sectionFromQuery
      : isAdminDashboardSection(sectionFromHash)
        ? sectionFromHash
        : null;

    if (!sectionId) {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      scrollToSection(sectionId);
    });

    return () => window.cancelAnimationFrame(frame);
  }, [pathname, searchParams]);

  useEffect(() => {
    if (pathname !== "/admin/dashboard") {
      return;
    }

    function handleHashChange(): void {
      const sectionId = window.location.hash.slice(1);

      if (isAdminDashboardSection(sectionId)) {
        scrollToSection(sectionId);
      }
    }

    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, [pathname]);

  return null;
}
