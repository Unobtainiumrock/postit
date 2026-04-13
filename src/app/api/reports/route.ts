import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import pool from "@/lib/db";

/** GET /api/reports?status=open|all — admin queue. Defaults to open. */
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!session.user.isAdmin) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status") || "open";
  const statusFilter =
    status === "all" ? "" : "WHERE r.status = 'open'";

  try {
    const { rows } = await pool.query(
      `SELECT r.id, r.item_id, r.reporter_id, r.reason, r.status,
              r.created_at, r.resolved_at,
              ru.handle AS reporter_handle,
              i.title AS item_title, i.canonical_url AS item_url, i.kind AS item_kind
       FROM reports r
       JOIN users ru ON ru.id = r.reporter_id
       JOIN items i  ON i.id = r.item_id
       ${statusFilter}
       ORDER BY r.created_at DESC
       LIMIT 200`
    );
    return NextResponse.json({ reports: rows });
  } catch (err) {
    console.error("[GET /api/reports]", err);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
