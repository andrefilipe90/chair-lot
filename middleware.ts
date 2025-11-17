import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const ENFORCED_LOCALE = "pt-BR";

export function middleware(request: NextRequest) {
  const localeCookie = request.cookies.get("NEXT_LOCALE")?.value;
  if (localeCookie === ENFORCED_LOCALE) {
    return NextResponse.next();
  }

  const response = NextResponse.next();
  response.cookies.set("NEXT_LOCALE", ENFORCED_LOCALE, {
    path: "/",
    sameSite: "lax",
  });

  return response;
}

export const config = {
  matcher: [
    "/((?!api|_next|.*\\.(?:js|css|png|jpg|jpeg|gif|svg|ico|json|txt)).*)",
  ],
};
