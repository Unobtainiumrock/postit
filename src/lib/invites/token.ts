import { randomBytes } from "crypto";
import pool from "@/lib/db";

/** Cookie name used to transport an invite token across the Cognito OAuth round-trip. */
export const INVITE_COOKIE = "postit.invite_token";

export function generateInviteToken(): string {
  // 32 bytes → 43 chars base64url (no padding). Plenty of entropy.
  return randomBytes(32).toString("base64url");
}

export type InviteValidationReason =
  | "not_found"
  | "revoked"
  | "expired"
  | "exhausted"
  | "email_mismatch";

export interface InviteValidation {
  ok: boolean;
  inviteId?: string;
  reason?: InviteValidationReason;
}

/**
 * Checks whether an invite token is currently redeemable. Does NOT mark it used —
 * callers must call `redeemInvite(inviteId)` to atomically claim a use.
 * If `email` is provided and the invite is locked to a specific email, the addresses
 * must match (case-insensitive).
 */
export async function validateInvite(
  token: string,
  email?: string
): Promise<InviteValidation> {
  const { rows } = await pool.query<{
    id: string;
    email: string | null;
    max_uses: number;
    used_count: number;
    expires_at: Date | null;
    revoked_at: Date | null;
  }>(
    `SELECT id, email, max_uses, used_count, expires_at, revoked_at
     FROM invites WHERE token = $1`,
    [token]
  );
  const row = rows[0];
  if (!row) return { ok: false, reason: "not_found" };
  if (row.revoked_at) return { ok: false, reason: "revoked" };
  if (row.expires_at && row.expires_at.getTime() < Date.now()) {
    return { ok: false, reason: "expired" };
  }
  if (row.used_count >= row.max_uses) return { ok: false, reason: "exhausted" };
  if (row.email && email && row.email.toLowerCase() !== email.toLowerCase()) {
    return { ok: false, reason: "email_mismatch" };
  }
  return { ok: true, inviteId: row.id };
}

/**
 * Atomically claims one use of an invite. Returns true only if the update modified
 * a row (which it will only do if the invite is still unrevoked, unexpired, and
 * has uses remaining). Race-safe without explicit locks.
 */
export async function redeemInvite(inviteId: string): Promise<boolean> {
  const { rowCount } = await pool.query(
    `UPDATE invites
     SET used_count = used_count + 1
     WHERE id = $1
       AND revoked_at IS NULL
       AND (expires_at IS NULL OR expires_at > NOW())
       AND used_count < max_uses`,
    [inviteId]
  );
  return (rowCount ?? 0) > 0;
}

export interface CreateInviteOptions {
  issuedBy: string;
  email?: string | null;
  maxUses?: number;
  /** Expiry in ISO; defaults to NOW() + 7 days if omitted. Pass null to never expire. */
  expiresAt?: Date | null | undefined;
}

/** Admin-only: mint a new invite. */
export async function createInvite(
  opts: CreateInviteOptions
): Promise<{ id: string; token: string }> {
  const token = generateInviteToken();
  const expires =
    opts.expiresAt === null
      ? null
      : opts.expiresAt ?? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const { rows } = await pool.query<{ id: string; token: string }>(
    `INSERT INTO invites (token, issued_by, email, max_uses, expires_at)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, token`,
    [token, opts.issuedBy, opts.email ?? null, opts.maxUses ?? 1, expires]
  );
  return rows[0];
}

/** Admin-only: mark an invite as revoked. */
export async function revokeInvite(inviteId: string): Promise<void> {
  await pool.query(
    `UPDATE invites SET revoked_at = NOW() WHERE id = $1 AND revoked_at IS NULL`,
    [inviteId]
  );
}
