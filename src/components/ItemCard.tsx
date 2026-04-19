"use client";

import { useState } from "react";
import LiquidGlass from "./LiquidGlass";
import type { ItemResponse } from "@/lib/items/types";

export default function ItemCard({
  item,
  onChanged,
}: {
  item: ItemResponse;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);

  async function toggleConsumed() {
    setBusy(true);
    try {
      const method = item.consumed_by_me ? "DELETE" : "POST";
      await fetch(`/api/items/${item.id}/consume`, { method });
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  const myPoster = item.posters.find((p) => p.note && item.posted_by_me);
  const myNote = myPoster?.note || null;
  const posterLabel = item.posters.map((p) => `@${p.handle}`).join(", ");
  const fallbackTitle = !item.title ? urlDisplay(item.canonical_url) : null;
  const isProcessing = item.status === "pending";

  return (
    <LiquidGlass>
      <a
        href={item.canonical_url}
        target="_blank"
        rel="noopener noreferrer"
        className="block group"
      >
        {item.thumbnail_url && (
          <div className="aspect-video bg-black/20 overflow-hidden">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={item.thumbnail_url}
              alt=""
              loading="lazy"
              className="w-full h-full object-cover group-hover:scale-[1.02] transition"
            />
          </div>
        )}
        <div className="p-4 space-y-2">
          <div className="flex items-center gap-2 text-[10px] text-white/60 uppercase tracking-wider">
            <span>{item.kind.replace("_", " ")}</span>
            {item.duration_seconds != null && (
              <>
                <span>·</span>
                <span>{formatDuration(item.duration_seconds)}</span>
              </>
            )}
            {isProcessing && (
              <>
                <span>·</span>
                <span className="text-amber-200/80">processing…</span>
              </>
            )}
          </div>
          {item.title ? (
            <h3 className="font-medium leading-snug">{item.title}</h3>
          ) : (
            fallbackTitle && (
              <h3 className="font-medium leading-snug break-all text-white/90">
                {fallbackTitle}
              </h3>
            )
          )}
          {item.description && (
            <p className="text-sm text-white/70 line-clamp-3">
              {item.description}
            </p>
          )}
          {item.categories.length > 0 && (
            <div className="flex flex-wrap gap-1 pt-1">
              {item.categories.map((c) => (
                <span
                  key={c.slug}
                  className="text-[10px] px-2 py-0.5 rounded-full bg-white/10 text-white/80"
                  title={c.slug}
                >
                  {c.name}
                </span>
              ))}
            </div>
          )}
        </div>
      </a>

      <div className="px-4 pb-4 space-y-2">
        {myNote && (
          <p className="text-xs italic text-white/70 border-l-2 border-white/20 pl-2">
            &ldquo;{myNote}&rdquo;
          </p>
        )}
        <div className="text-xs text-white/50">shared by {posterLabel}</div>
        {item.consumed_by.length > 0 && (
          <div className="text-xs text-emerald-200/80">
            ✓ {item.consumed_by.map((c) => `@${c.handle}`).join(" ")}
          </div>
        )}
        <button
          onClick={toggleConsumed}
          disabled={busy}
          className={`w-full px-3 py-1.5 rounded-lg text-sm font-medium transition disabled:opacity-50 ${
            item.consumed_by_me
              ? "bg-emerald-500/25 text-emerald-100 hover:bg-emerald-500/35"
              : "bg-white/10 text-white/90 hover:bg-white/20"
          }`}
        >
          {item.consumed_by_me ? "✓ Consumed" : "Mark consumed"}
        </button>
      </div>
    </LiquidGlass>
  );
}

function formatDuration(s: number): string {
  const total = Math.max(0, Math.floor(s));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const sec = total % 60;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

/**
 * Fallback when an item hasn't been enriched yet (no title/description/thumbnail).
 * Shows `host/first-path-segment` so pending cards are visually distinguishable
 * instead of all collapsing to "shared by @you" with only a note.
 */
function urlDisplay(raw: string): string {
  try {
    const u = new URL(raw);
    const host = u.hostname.replace(/^www\./, "");
    const path = u.pathname === "/" ? "" : u.pathname;
    return host + path;
  } catch {
    return raw;
  }
}
