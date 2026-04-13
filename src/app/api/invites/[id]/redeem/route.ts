import { NextRequest, NextResponse } from "next/server";
import { validateInvite, INVITE_COOKIE } from "@/lib/invites/token";

/**
 * GET /api/invites/[id]/redeem — user-facing invite entry point.
 * Validates the token (without consuming a use), stashes it in an httpOnly cookie,
 * and redirects to /login. The actual use is claimed atomically inside auth.ts's
 * ensureUser() when the signup completes.
 */
export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id: token } = await ctx.params;
  const validation = await validateInvite(token);

  if (!validation.ok) {
    const url = new URL("/login", req.url);
    url.searchParams.set("error", `invite_${validation.reason || "invalid"}`);
    return NextResponse.redirect(url);
  }

  const loginUrl = new URL("/login", req.url);
  loginUrl.searchParams.set("invite", "accepted");
  const response = NextResponse.redirect(loginUrl);
  response.cookies.set({
    name: INVITE_COOKIE,
    value: token,
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    maxAge: 60 * 60, // 1 hour — plenty of time to complete signup
    secure: process.env.NODE_ENV === "production",
  });
  return response;
}
