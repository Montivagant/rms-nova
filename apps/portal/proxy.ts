import { NextResponse, type NextRequest } from "next/server";
import { hasEnvPortalToken } from "@lib/env";

const PUBLIC_PATHS = ["/login", "/api/session"];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (
    PUBLIC_PATHS.some((path) => pathname.startsWith(path)) ||
    pathname.startsWith("/_next") ||
    pathname === "/favicon.ico"
  ) {
    return NextResponse.next();
  }

  const hasCookie = request.cookies.has("portal_access_token");
  if (hasCookie || hasEnvPortalToken()) {
    return NextResponse.next();
  }

  const loginUrl = request.nextUrl.clone();
  loginUrl.pathname = "/login";
  loginUrl.searchParams.set("next", pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/((?!_next|favicon\\.ico).*)"]
};
