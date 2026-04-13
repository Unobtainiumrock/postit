import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import pool from "@/lib/db";

/** PATCH /api/reports/[id] — admin resolve or dismiss. Body: { status: "resolved"|"dismissed" } */
export async function PATCH(
  req: NextRequest,
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
  const body = await req.json().catch(() => ({}));
  const status =
    body?.status === "resolved" || body?.status === "dismissed"
      ? body.status
      : null;

  if (!status) {
    return NextResponse.json(
      { error: "status must be 'resolved' or 'dismissed'" },
      { status: 400 }
    );
  }

  try {
    await pool.query(
      `UPDATE reports
       SET status = $1, resolved_by = $2, resolved_at = NOW()
       WHERE id = $3`,
      [status, session.user.id, id]
    );
    return NextResponse.json({ updated: true, status });
  } catch (err) {
    console.error("[PATCH /api/reports/[id]]", err);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
