import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { revokeInvite } from "@/lib/invites/token";

/** DELETE /api/invites/[id] — admin revoke. */
export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!session.user.isAdmin) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const { id } = await ctx.params;
  try {
    await revokeInvite(id);
    return NextResponse.json({ revoked: true });
  } catch (err) {
    console.error("[DELETE /api/invites/[id]]", err);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
