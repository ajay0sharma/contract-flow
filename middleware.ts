import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import {
  getHomePathForEmail,
  isAdminEmail,
  isLegalEmail,
  isSupportEmail,
} from "@/lib/legal-access";

const isPublicRoute = createRouteMatcher([
  "/login",
  "/login/(.*)",
  "/sign-up",
  "/sign-up/(.*)",
  "/api/cron/(.*)",
]);

const businessOnlyPaths = ["/dashboard", "/contracts/new"];
const adminBlockedPaths = ["/dashboard", "/contracts/new"];
const supportBlockedPaths = ["/contracts/new", "/legal", "/admin"];
const legalSettingsPaths = ["/settings/clause-library", "/settings/templates"];

const platformAdminPaths = [
  "/admin",
  "/settings/workflow",
  "/settings/po-integration",
  "/settings/directory",
];

function isPlatformAdminPath(pathname: string): boolean {
  return platformAdminPaths.some((path) => pathname.startsWith(path));
}

export default clerkMiddleware(
  async (auth, req) => {
    const { userId, sessionClaims } = await auth();
    const email =
      typeof sessionClaims?.email === "string" ? sessionClaims.email : "";
    const hasRoleEmail = email.length > 0;
    const homePath = getHomePathForEmail(email);
    const isAdmin = isAdminEmail(email);
    const isLegalOnly = isLegalEmail(email) && !isAdmin;
    const isSupport = isSupportEmail(email);

    if (
      userId &&
      (req.nextUrl.pathname.startsWith("/login") ||
        req.nextUrl.pathname.startsWith("/sign-up"))
    ) {
      return NextResponse.redirect(new URL(homePath, req.url));
    }

    if (
      userId &&
      hasRoleEmail &&
      isPlatformAdminPath(req.nextUrl.pathname) &&
      !isAdmin
    ) {
      return NextResponse.redirect(new URL(homePath, req.url));
    }

    if (
      userId &&
      hasRoleEmail &&
      isAdmin &&
      adminBlockedPaths.some((path) => req.nextUrl.pathname.startsWith(path))
    ) {
      return NextResponse.redirect(new URL("/admin/dashboard", req.url));
    }

    if (
      userId &&
      hasRoleEmail &&
      isLegalOnly &&
      businessOnlyPaths.some((path) => req.nextUrl.pathname.startsWith(path))
    ) {
      return NextResponse.redirect(new URL("/legal/dashboard", req.url));
    }

    if (
      userId &&
      hasRoleEmail &&
      isSupport &&
      supportBlockedPaths.some((path) => req.nextUrl.pathname.startsWith(path))
    ) {
      return NextResponse.redirect(new URL("/dashboard", req.url));
    }

    if (
      userId &&
      hasRoleEmail &&
      legalSettingsPaths.some((path) => req.nextUrl.pathname.startsWith(path)) &&
      !isLegalEmail(email) &&
      !isAdmin
    ) {
      return NextResponse.redirect(new URL(homePath, req.url));
    }

    if (!isPublicRoute(req) && !userId) {
      const loginUrl = new URL("/login", req.url);
      loginUrl.searchParams.set("redirect_url", req.url);
      return NextResponse.redirect(loginUrl);
    }
  },
  { frontendApiProxy: { enabled: false } },
);

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
    "/__clerk/(.*)",
  ],
};
