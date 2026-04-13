"use client";

import { useEffect, useState } from "react";
import { signIn } from "next-auth/react";
import LiquidGlass from "./LiquidGlass";

const ERROR_MESSAGES: Record<string, string> = {
  invite_required:
    "You need an invite token to sign up. Ask someone on the board for a link.",
  invite_invalid: "That invite token is invalid.",
  invite_not_found: "No invite found for that token.",
  invite_revoked: "That invite has been revoked.",
  invite_expired: "That invite has expired.",
  invite_exhausted: "That invite has no uses remaining.",
  invite_email_mismatch: "That invite is locked to a different email.",
  database_unavailable:
    "Database is unreachable. Is Postgres running? (npm run db:up)",
  CredentialsSignin: "Sign-in failed.",
};

function humanizeError(code: string): string {
  return ERROR_MESSAGES[code] || `Sign-in failed (${code})`;
}

export default function LoginForm({
  initialError,
  inviteAccepted,
  devMode,
}: {
  initialError?: string;
  inviteAccepted?: boolean;
  devMode: boolean;
}) {
  const [email, setEmail] = useState("");
  const [inviteToken, setInviteToken] = useState("");
  const [error, setError] = useState<string | null>(
    initialError ? humanizeError(initialError) : null
  );
  const [submitting, setSubmitting] = useState(false);

  // Hitting the session route returns Set-Cookie headers that clear unreadable JWT cookies
  // (e.g. after NEXTAUTH_SECRET rotated). RSC `auth()` alone does not forward those headers.
  useEffect(() => {
    void fetch("/api/auth/session", { credentials: "include" });
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      if (devMode) {
        const result = await signIn("credentials", {
          email,
          inviteToken: inviteToken || undefined,
          redirect: false,
          callbackUrl: "/inbound",
        });
        if (result?.error) {
          setError(humanizeError(result.error));
        } else if (result?.ok) {
          window.location.href = "/inbound";
        }
      } else {
        await signIn("cognito", { callbackUrl: "/inbound" });
      }
    } catch (err) {
      console.error(err);
      setError("Sign-in failed. Check console.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <LiquidGlass className="p-8 w-full max-w-md">
        <h1 className="text-3xl font-semibold mb-1 tracking-tight">postit</h1>
        <p className="text-white/70 text-sm mb-6">
          Sign in to the shared board.
        </p>
        {inviteAccepted && (
          <div className="mb-4 text-sm text-emerald-200 bg-emerald-500/15 border border-emerald-500/30 px-3 py-2 rounded-lg">
            Invite accepted. Sign in to claim it.
          </div>
        )}
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <label className="flex flex-col gap-1">
            <span className="text-sm text-white/80">Email</span>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="px-3 py-2 rounded-lg bg-white/10 border border-white/20 text-white placeholder:text-white/40 focus:outline-none focus:border-white/40"
              placeholder="you@example.com"
              autoComplete="email"
            />
          </label>
          {devMode && (
            <label className="flex flex-col gap-1">
              <span className="text-sm text-white/80">
                Invite token{" "}
                <span className="text-white/50">(new users only)</span>
              </span>
              <input
                type="text"
                value={inviteToken}
                onChange={(e) => setInviteToken(e.target.value)}
                className="px-3 py-2 rounded-lg bg-white/10 border border-white/20 text-white placeholder:text-white/40 focus:outline-none focus:border-white/40 font-mono text-sm"
                placeholder="paste your invite token"
              />
            </label>
          )}
          {error && (
            <div className="text-sm text-rose-200 bg-rose-900/30 border border-rose-500/30 px-3 py-2 rounded-lg">
              {error}
            </div>
          )}
          <button
            type="submit"
            disabled={submitting}
            className="px-4 py-2 rounded-lg bg-white/90 text-slate-900 font-medium hover:bg-white disabled:opacity-50 transition"
          >
            {submitting
              ? "Signing in…"
              : devMode
                ? "Sign in (dev)"
                : "Continue with Cognito"}
          </button>
        </form>
      </LiquidGlass>
    </div>
  );
}
