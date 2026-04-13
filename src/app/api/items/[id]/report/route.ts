import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import pool from "@/lib/db";

/** POST /api/items/[id]/report — flag an item for admin review. */
export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const reason =
    typeof body?.reason === "string" ? body.reason.trim().slice(0, 500) : null;

  try {
    await pool.query(
      `INSERT INTO reports (item_id, reporter_id, reason) VALUES ($1, $2, $3)`,
      [id, session.user.id, reason]
    );
    return NextResponse.json({ reported: true });
  } catch (err) {
    console.error("[POST /api/items/[id]/report]", err);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
