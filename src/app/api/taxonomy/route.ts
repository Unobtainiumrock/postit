import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import pool from "@/lib/db";

/**
 * GET /api/taxonomy — read the active category tree (used by admin UI and future
 * category filters). Excludes soft-deprecated categories.
 */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const { rows } = await pool.query(
      `SELECT id, parent_id, slug, name, description, depth, sort_order
       FROM categories
       WHERE deprecated_at IS NULL
       ORDER BY depth, sort_order, name`
    );
    return NextResponse.json({ categories: rows });
  } catch (err) {
    console.error("[GET /api/taxonomy]", err);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
