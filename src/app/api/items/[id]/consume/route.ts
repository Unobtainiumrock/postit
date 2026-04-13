import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import pool from "@/lib/db";

/** POST /api/items/[id]/consume — mark item consumed by the viewer. Idempotent. */
export async function POST(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;
  try {
    await pool.query(
      `INSERT INTO item_consumed (item_id, user_id)
       VALUES ($1, $2)
       ON CONFLICT (item_id, user_id) DO NOTHING`,
      [id, session.user.id]
    );
    return NextResponse.json({ consumed: true });
  } catch (err) {
    console.error("[POST /api/items/[id]/consume]", err);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}

/** DELETE /api/items/[id]/consume — un-mark. */
export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;
  try {
    await pool.query(
      `DELETE FROM item_consumed WHERE item_id = $1 AND user_id = $2`,
      [id, session.user.id]
    );
    return NextResponse.json({ consumed: false });
  } catch (err) {
    console.error("[DELETE /api/items/[id]/consume]", err);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
