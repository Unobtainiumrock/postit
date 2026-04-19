import NextAuth, { CredentialsSignin, type NextAuthConfig } from "next-auth";
import { JWTSessionError } from "@auth/core/errors";
import Cognito from "next-auth/providers/cognito";
import Credentials from "next-auth/providers/credentials";
import { cookies } from "next/headers";
import type { PoolClient } from "pg";
import pool from "./db";
import { INVITE_COOKIE } from "./invites/token";

/**
 * Postit auth:
 *   - Dev: Credentials provider (email-only). Invite token required for first signup,
 *          unless the email matches BOOTSTRAP_ADMIN_EMAIL (comma/space/semicolon
 *          separated list; each auto-grants is_admin on first dev signup).
 *   - Prod: Cognito OAuth. Invite token is read from a cookie set by the
 *          /invite/[token] redemption page before the OAuth redirect.
 *
 * Both flows funnel through `ensureUser`, which atomically creates a users row
 * (redeeming the invite if required) or returns the existing one.
 */

const isDev = process.env.NODE_ENV === "development";

class DatabaseUnavailableError extends CredentialsSignin {
  code = "database_unavailable";
}
class InviteRequiredError extends CredentialsSignin {
  code = "invite_required";
}
class InviteInvalidError extends CredentialsSignin {
  code = "invite_invalid";
}

async function pickAvailableHandle(
  db: Pick<PoolClient, "query">,
  email: string
): Promise<string> {
  const base =
    email
      .split("@")[0]
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "")
      .slice(0, 32) || "user";
  for (let attempt = 0; attempt < 10; attempt++) {
    const candidate = attempt === 0 ? base : `${base}${attempt + 1}`;
    const { rows } = await db.query<{ id: string }>(
      "SELECT id FROM users WHERE handle = $1",
      [candidate]
    );
    if (rows.length === 0) return candidate;
  }
  return `${base}${Date.now().toString(36).slice(-4)}`;
}

interface EnsureUserParams {
  email: string;
  displayName: string;
  cognitoSub: string;
  avatarUrl?: string | null;
  inviteToken?: string | null;
}

async function ensureUser(
  params: EnsureUserParams
): Promise<{ id: string; isAdmin: boolean; handle: string }> {
  const { email, displayName, cognitoSub, avatarUrl, inviteToken } = params;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Existing user? Match on either email or cognito_sub (lets a dev-mode user
    // graduate to Cognito cleanly by re-using the same email).
    const { rows: existing } = await client.query<{
      id: string;
      is_admin: boolean;
      handle: string;
    }>(
      `SELECT id, is_admin, handle
       FROM users
       WHERE email = $1 OR cognito_sub = $2
       LIMIT 1`,
      [email, cognitoSub]
    );
    if (existing[0]) {
      await client.query(
        `UPDATE users SET cognito_sub = $2,
                          display_name = $3,
                          avatar_url = COALESCE($4, avatar_url)
         WHERE id = $1`,
        [existing[0].id, cognitoSub, displayName, avatarUrl ?? null]
      );
      await client.query("COMMIT");
      return {
        id: existing[0].id,
        isAdmin: existing[0].is_admin,
        handle: existing[0].handle,
      };
    }

    // New user path ───────────────────────────────────────────────────────────
    const bootstrapRaw = (process.env.BOOTSTRAP_ADMIN_EMAIL || "").trim().toLowerCase();
    const bootstrapEmails = new Set(
      bootstrapRaw
        .split(/[\s,;]+/)
        .map((s) => s.trim())
        .filter(Boolean)
    );
    const isBootstrap = bootstrapEmails.has(email.toLowerCase());

    if (!isBootstrap) {
      if (!inviteToken) throw new InviteRequiredError();

      // Atomically validate and consume the invite inside the same transaction
      // as user creation so an insert failure does not burn a use.
      const { rowCount } = await client.query(
        `UPDATE invites
         SET used_count = used_count + 1
         WHERE token = $1
           AND revoked_at IS NULL
           AND (expires_at IS NULL OR expires_at > NOW())
           AND used_count < max_uses
           AND (email IS NULL OR lower(email) = lower($2))`,
        [inviteToken, email]
      );
      if ((rowCount ?? 0) === 0) throw new InviteInvalidError();
    }

    for (let attempt = 0; attempt < 12; attempt++) {
      const handle = await pickAvailableHandle(client, email);
      try {
        const { rows } = await client.query<{
          id: string;
          is_admin: boolean;
          handle: string;
        }>(
          `INSERT INTO users (cognito_sub, email, display_name, handle, avatar_url, is_admin)
           VALUES ($1, $2, $3, $4, $5, $6)
           RETURNING id, is_admin, handle`,
          [cognitoSub, email, displayName, handle, avatarUrl ?? null, isBootstrap]
        );
        await client.query("COMMIT");
        return {
          id: rows[0].id,
          isAdmin: rows[0].is_admin,
          handle: rows[0].handle,
        };
      } catch (error) {
        const pgError = error as { code?: string; constraint?: string };
        if (pgError.code !== "23505") throw error;

        // Another request may have created the user concurrently, or we may have
        // raced on a generated handle. Re-check for the user before retrying.
        const { rows: winner } = await client.query<{
          id: string;
          is_admin: boolean;
          handle: string;
        }>(
          `SELECT id, is_admin, handle
           FROM users
           WHERE email = $1 OR cognito_sub = $2
           LIMIT 1`,
          [email, cognitoSub]
        );
        if (winner[0]) {
          await client.query("COMMIT");
          return {
            id: winner[0].id,
            isAdmin: winner[0].is_admin,
            handle: winner[0].handle,
          };
        }
        if (pgError.constraint === "users_handle_key") continue;
        throw error;
      }
    }

    throw new Error("Unable to allocate a unique handle for new user");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

// ─── Providers ──────────────────────────────────────────────────────────────
const devProvider = Credentials({
  name: "Dev Login",
  credentials: {
    email: { label: "Email", type: "email" },
    inviteToken: {
      label: "Invite Token (required for new users)",
      type: "text",
    },
  },
  async authorize(credentials) {
    const email = (credentials?.email as string | undefined)?.trim();
    let inviteToken =
      (credentials?.inviteToken as string | undefined)?.trim() || null;
    if (!inviteToken) {
      try {
        const store = await cookies();
        inviteToken = store.get(INVITE_COOKIE)?.value?.trim() || null;
      } catch {
        /* cookies() unavailable in some contexts */
      }
    }
    if (!email) return null;

    try {
      const u = await ensureUser({
        email,
        displayName: email.split("@")[0],
        cognitoSub: `dev-${email}`,
        inviteToken,
      });
      return { id: u.id, email, name: email.split("@")[0] };
    } catch (err) {
      if (err instanceof CredentialsSignin) throw err;
      console.error(
        "[auth] dev authorize failed (is Postgres running? npm run db:up):",
        err
      );
      throw new DatabaseUnavailableError();
    }
  },
});

const cognitoProvider = Cognito({
  clientId: process.env.COGNITO_CLIENT_ID!,
  clientSecret: process.env.COGNITO_CLIENT_SECRET!,
  issuer: process.env.COGNITO_ISSUER!,
});

const providers: NextAuthConfig["providers"] = isDev
  ? [devProvider]
  : [cognitoProvider];

/** Auth.js reads AUTH_SECRET first; keep in sync with NEXTAUTH_SECRET in .env.local. */
const authSecret = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET;

// ─── NextAuth config ────────────────────────────────────────────────────────
export const { handlers, signIn, signOut, auth } = NextAuth({
  trustHost: true,
  secret: authSecret,
  // Stale cookies from a rotated secret trigger JWTSessionError; the default logger
  // emits multiple console.error lines and spams the Next.js dev overlay (shown as "3 issues").
  logger: {
    error(error) {
      if (error instanceof JWTSessionError) return;
      console.error("[auth]", error);
    },
  },
  providers,
  session: { strategy: "jwt" },
  callbacks: {
    async signIn({ user, profile, account }) {
      // Dev credentials do their own ensureUser inside authorize(); don't duplicate here.
      if (account?.provider === "credentials") return true;

      const sub =
        (typeof profile?.sub === "string" && profile.sub) ||
        account?.providerAccountId;
      if (!user?.email || !sub) return false;

      // Pull the invite token from the cookie (set by /invite/[token] before redirect).
      let inviteToken: string | null = null;
      try {
        const store = await cookies();
        inviteToken = store.get(INVITE_COOKIE)?.value ?? null;
      } catch {
        // cookies() unavailable in this context (non-request) — invite token will be null.
      }

      try {
        await ensureUser({
          email: user.email,
          displayName: user.name || user.email.split("@")[0],
          cognitoSub: String(sub),
          avatarUrl: user.image,
          inviteToken,
        });
        return true;
      } catch (err) {
        if (err instanceof InviteRequiredError || err instanceof InviteInvalidError) {
          console.warn(
            `[auth] invite gate rejected signup for ${user.email} (${err.code})`
          );
          return false;
        }
        console.error("[auth] signIn failed:", err);
        return false;
      }
    },
    async jwt({ token, user }) {
      if (user?.email) {
        try {
          const { rows } = await pool.query<{
            id: string;
            is_admin: boolean;
            handle: string;
          }>(
            `SELECT id, is_admin, handle FROM users WHERE email = $1 LIMIT 1`,
            [user.email]
          );
          if (rows[0]) {
            token.appUserId = rows[0].id;
            token.isAdmin = rows[0].is_admin;
            token.handle = rows[0].handle;
          }
        } catch (err) {
          console.error("[auth] jwt lookup failed:", err);
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        if (typeof token.appUserId === "string") session.user.id = token.appUserId;
        if (typeof token.isAdmin === "boolean")
          session.user.isAdmin = token.isAdmin;
        if (typeof token.handle === "string") session.user.handle = token.handle;
      }
      return session;
    },
  },
  pages: { signIn: "/login" },
});
