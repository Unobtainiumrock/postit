"use client";

import { useCallback, useEffect, useState } from "react";
import LiquidGlass from "./LiquidGlass";

type Section = "invites" | "reports" | "taxonomy";

interface Invite {
  id: string;
  token: string;
  email: string | null;
  max_uses: number;
  used_count: number;
  expires_at: string | null;
  revoked_at: string | null;
  created_at: string;
  issued_by_handle: string | null;
}

interface Report {
  id: string;
  item_id: string;
  reporter_id: string;
  reason: string | null;
  status: string;
  created_at: string;
  reporter_handle: string;
  item_title: string | null;
  item_url: string;
  item_kind: string;
}

interface Category {
  id: string;
  parent_id: string | null;
  slug: string;
  name: string;
  description: string | null;
  depth: number;
  sort_order: number;
}

const STATUS_STYLES: Record<string, string> = {
  active: "bg-emerald-500/20 text-emerald-200",
  revoked: "bg-rose-500/20 text-rose-200",
  exhausted: "bg-amber-500/20 text-amber-200",
  expired: "bg-amber-500/20 text-amber-200",
};

function StatusPill({ s }: { s: string }) {
  return (
    <span
      className={`px-2 py-0.5 rounded text-xs ${STATUS_STYLES[s] || "bg-white/10"}`}
    >
      {s}
    </span>
  );
}

export default function AdminClient() {
  const [section, setSection] = useState<Section>("invites");
  return (
    <div className="space-y-4">
      <LiquidGlass className="p-2 inline-flex gap-1 rounded-full">
        {(["invites", "reports", "taxonomy"] as const).map((s) => (
          <button
            key={s}
            onClick={() => setSection(s)}
            className={`px-4 py-1.5 rounded-full text-sm capitalize transition ${
              section === s
                ? "bg-white/20 text-white"
                : "text-white/70 hover:bg-white/10"
            }`}
          >
            {s}
          </button>
        ))}
      </LiquidGlass>
      {section === "invites" && <InvitesPanel />}
      {section === "reports" && <ReportsPanel />}
      {section === "taxonomy" && <TaxonomyPanel />}
    </div>
  );
}

// ─── Invites ─────────────────────────────────────────────────────────────
function InvitesPanel() {
  const [invites, setInvites] = useState<Invite[]>([]);
  const [loading, setLoading] = useState(true);
  const [maxUses, setMaxUses] = useState(1);
  const [expiresDays, setExpiresDays] = useState(7);
  const [email, setEmail] = useState("");
  const [creating, setCreating] = useState(false);
  const [newInvite, setNewInvite] = useState<{ token: string } | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/invites");
    if (res.ok) {
      const data = await res.json();
      setInvites(data.invites);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    setNewInvite(null);
    try {
      const res = await fetch("/api/invites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          maxUses,
          expiresDays,
          email: email.trim() || null,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setNewInvite(data.invite);
        setEmail("");
        await load();
      }
    } finally {
      setCreating(false);
    }
  }

  async function revoke(id: string) {
    if (!confirm("Revoke this invite?")) return;
    await fetch(`/api/invites/${id}`, { method: "DELETE" });
    await load();
  }

  const inviteUrl = (token: string) =>
    typeof window !== "undefined"
      ? `${window.location.origin}/api/invites/${token}/redeem`
      : `/api/invites/${token}/redeem`;

  const statusOf = (i: Invite) =>
    i.revoked_at
      ? "revoked"
      : i.used_count >= i.max_uses
        ? "exhausted"
        : i.expires_at && new Date(i.expires_at) < new Date()
          ? "expired"
          : "active";

  return (
    <div className="space-y-4">
      <LiquidGlass className="p-6">
        <h3 className="font-semibold mb-4">Create invite</h3>
        <form onSubmit={create} className="flex flex-wrap gap-3 items-end">
          <label className="flex flex-col gap-1">
            <span className="text-xs text-white/70">Max uses</span>
            <input
              type="number"
              min={1}
              max={100}
              value={maxUses}
              onChange={(e) => setMaxUses(Number(e.target.value))}
              className="w-20 px-2 py-1.5 rounded bg-white/10 border border-white/20 text-white focus:outline-none focus:border-white/40"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-white/70">Expires in days</span>
            <input
              type="number"
              min={1}
              max={365}
              value={expiresDays}
              onChange={(e) => setExpiresDays(Number(e.target.value))}
              className="w-24 px-2 py-1.5 rounded bg-white/10 border border-white/20 text-white focus:outline-none focus:border-white/40"
            />
          </label>
          <label className="flex flex-col gap-1 flex-1 min-w-[220px]">
            <span className="text-xs text-white/70">Email lock (optional)</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="leave blank for any email"
              className="px-2 py-1.5 rounded bg-white/10 border border-white/20 text-white placeholder:text-white/40 focus:outline-none focus:border-white/40"
            />
          </label>
          <button
            type="submit"
            disabled={creating}
            className="px-4 py-2 rounded-lg bg-white/90 text-slate-900 font-medium hover:bg-white disabled:opacity-50"
          >
            {creating ? "Creating…" : "Create"}
          </button>
        </form>
        {newInvite && (
          <div className="mt-4 p-3 rounded-lg bg-emerald-500/15 border border-emerald-500/40">
            <p className="text-sm text-emerald-100 mb-1">
              Invite created. Share this link:
            </p>
            <code className="text-xs font-mono text-white break-all select-all">
              {inviteUrl(newInvite.token)}
            </code>
          </div>
        )}
      </LiquidGlass>

      <LiquidGlass className="p-6">
        <h3 className="font-semibold mb-4">All invites</h3>
        {loading ? (
          <div className="text-white/60">Loading…</div>
        ) : invites.length === 0 ? (
          <div className="text-white/60 text-sm">No invites yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs uppercase text-white/60 text-left">
                <tr>
                  <th className="pb-2 pr-3">Token</th>
                  <th className="pb-2 pr-3">Issuer</th>
                  <th className="pb-2 pr-3">Email lock</th>
                  <th className="pb-2 pr-3">Uses</th>
                  <th className="pb-2 pr-3">Expires</th>
                  <th className="pb-2 pr-3">Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {invites.map((i) => (
                  <tr key={i.id} className="border-t border-white/10">
                    <td className="py-2 pr-3 font-mono text-xs">
                      {i.token.slice(0, 16)}…
                    </td>
                    <td className="py-2 pr-3">@{i.issued_by_handle || "?"}</td>
                    <td className="py-2 pr-3 text-white/70">
                      {i.email || "—"}
                    </td>
                    <td className="py-2 pr-3">
                      {i.used_count}/{i.max_uses}
                    </td>
                    <td className="py-2 pr-3 text-white/70">
                      {i.expires_at
                        ? new Date(i.expires_at).toLocaleDateString()
                        : "never"}
                    </td>
                    <td className="py-2 pr-3">
                      <StatusPill s={statusOf(i)} />
                    </td>
                    <td className="py-2">
                      {statusOf(i) === "active" && (
                        <button
                          onClick={() => revoke(i.id)}
                          className="text-xs text-rose-300 hover:text-rose-200"
                        >
                          Revoke
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </LiquidGlass>
    </div>
  );
}

// ─── Reports ─────────────────────────────────────────────────────────────
function ReportsPanel() {
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const res = await fetch("/api/reports");
    if (res.ok) {
      const data = await res.json();
      setReports(data.reports);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function resolve(id: string, status: "resolved" | "dismissed") {
    await fetch(`/api/reports/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    await load();
  }

  return (
    <LiquidGlass className="p-6">
      <h3 className="font-semibold mb-4">Open reports</h3>
      {loading ? (
        <div className="text-white/60">Loading…</div>
      ) : reports.length === 0 ? (
        <div className="text-white/60 text-sm">No open reports.</div>
      ) : (
        <ul className="space-y-3">
          {reports.map((r) => (
            <li
              key={r.id}
              className="border border-white/10 rounded-lg p-3 bg-white/5"
            >
              <div className="flex flex-wrap items-start gap-3">
                <div className="flex-1 min-w-0">
                  <div className="text-xs text-white/60 mb-1">
                    reported by @{r.reporter_handle} ·{" "}
                    {new Date(r.created_at).toLocaleString()}
                  </div>
                  <a
                    href={r.item_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-medium hover:underline"
                  >
                    {r.item_title || r.item_url}
                  </a>
                  <div className="text-xs text-white/50 uppercase tracking-wider mt-0.5">
                    {r.item_kind}
                  </div>
                  {r.reason && (
                    <p className="text-sm text-white/80 mt-2 italic">
                      &ldquo;{r.reason}&rdquo;
                    </p>
                  )}
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => resolve(r.id, "resolved")}
                    className="px-3 py-1 rounded bg-emerald-500/20 text-emerald-100 text-xs hover:bg-emerald-500/30"
                  >
                    Resolve
                  </button>
                  <button
                    onClick={() => resolve(r.id, "dismissed")}
                    className="px-3 py-1 rounded bg-white/10 text-white/80 text-xs hover:bg-white/20"
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </LiquidGlass>
  );
}

// ─── Taxonomy (read-only for P4; full editor deferred) ───────────────────
function TaxonomyPanel() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/taxonomy")
      .then((r) => r.json())
      .then((d) => setCategories(d.categories || []))
      .finally(() => setLoading(false));
  }, []);

  const tops = categories.filter((c) => c.depth === 1);
  const leaves = (parentId: string) =>
    categories.filter((c) => c.parent_id === parentId);

  return (
    <LiquidGlass className="p-6">
      <h3 className="font-semibold mb-1">Taxonomy</h3>
      <p className="text-xs text-white/60 mb-4">
        Read-only for now. Edit <code>taxonomy/taxonomy.json</code> and run{" "}
        <code>npm run taxonomy:seed</code> to update.
      </p>
      {loading ? (
        <div className="text-white/60">Loading…</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {tops.map((top) => (
            <div
              key={top.id}
              className="border border-white/10 rounded-lg p-3 bg-white/5"
            >
              <div className="font-medium mb-1">{top.name}</div>
              {top.description && (
                <div className="text-xs text-white/60 mb-2">
                  {top.description}
                </div>
              )}
              <ul className="space-y-1">
                {leaves(top.id).map((leaf) => (
                  <li key={leaf.id} className="text-sm">
                    <span className="text-white/90">{leaf.name}</span>{" "}
                    <code className="text-[10px] font-mono text-white/50">
                      {leaf.slug}
                    </code>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </LiquidGlass>
  );
}
