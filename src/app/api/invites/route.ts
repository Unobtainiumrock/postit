import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import pool from "@/lib/db";
import { createInvite } from "@/lib/invites/token";

async function requireAdmin(): Promise<
  | { ok: true; userId: string }
  | { ok: false; status: 401 | 403 }
> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, status: 401 };
  if (!session.user.isAdmin) return { ok: false, status: 403 };
  return { ok: true, userId: session.user.id };
}

/** GET /api/invites — admin list of all invites (most recent first). */
export async function GET() {
  const g = await requireAdmin();
  if (!g.ok) return NextResponse.json({ error: "forbidden" }, { status: g.status });
  try {
    const { rows } = await pool.query(
      `SELECT i.id, i.token, i.email, i.max_uses, i.used_count,
              i.expires_at, i.revoked_at, i.created_at,
              u.handle AS issued_by_handle
       FROM invites i
       LEFT JOIN users u ON u.id = i.issued_by
       ORDER BY i.created_at DESC
       LIMIT 200`
    );
    return NextResponse.json({ invites: rows });
  } catch (err) {
    console.error("[GET /api/invites]", err);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}

/** POST /api/invites — admin mint a new invite. */
export async function POST(req: NextRequest) {
  const g = await requireAdmin();
  if (!g.ok) return NextResponse.json({ error: "forbidden" }, { status: g.status });

  const body = await req.json().catch(() => ({}));
  const maxUses = Math.max(1, Math.min(100, Number(body.maxUses) || 1));
  const email =
    typeof body.email === "string" && body.email.trim()
      ? body.email.trim().toLowerCase()
      : null;
  const expiresDaysRaw = Number(body.expiresDays);
  const expiresDays =
    Number.isFinite(expiresDaysRaw) && expiresDaysRaw > 0
      ? Math.min(365, expiresDaysRaw)
      : 7;
  const expiresAt = new Date(Date.now() + expiresDays * 24 * 60 * 60 * 1000);

  try {
    const invite = await createInvite({
      issuedBy: g.userId,
      email,
      maxUses,
      expiresAt,
    });
    return NextResponse.json({ invite }, { status: 201 });
  } catch (err) {
    console.error("[POST /api/invites]", err);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
