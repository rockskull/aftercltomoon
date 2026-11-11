import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE } from "./server/auth/cookie-names";

/**
 * Members-only pages: send signed-out visitors to the login page first, and
 * back here afterwards. This is only a fast, optimistic check (is there a
 * session cookie?). The pages and server actions verify the session themselves.
 */
export function proxy(request: NextRequest) {
  // Only page loads are redirected. Form submissions (server actions POST to the
  // same URL) go through so the action can refuse them itself and hand the typed
  // text back, instead of the visitor losing a half-written proposal.
  if (request.method !== "GET" && request.method !== "HEAD") return NextResponse.next();
  if (request.cookies.has(SESSION_COOKIE)) return NextResponse.next();
  const login = new URL("/login", request.url);
  login.searchParams.set("returnTo", request.nextUrl.pathname);
  return NextResponse.redirect(login);
}

export const config = {
  matcher: ["/host"],
};
