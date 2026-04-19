"use client";

import { useState } from "react";
import LiquidGlass from "./LiquidGlass";
import MasonryGrid from "./MasonryGrid";
import ItemCard from "./ItemCard";
import type { ItemResponse } from "@/lib/items/types";

export default function SearchView() {
  const [q, setQ] = useState("");
  const [mineOnly, setMineOnly] = useState(false);
  const [items, setItems] = useState<ItemResponse[] | null>(null);
  const [loading, setLoading] = useState(false);

  async function runSearch() {
    if (!q.trim()) return;
    setLoading(true);
    try {
      const mode = mineOnly ? "mine" : "all";
      const res = await fetch(
        `/api/search?q=${encodeURIComponent(q)}&mode=${encodeURIComponent(mode)}`,
        { cache: "no-store" }
      );
      if (res.ok) {
        const data = await res.json();
        setItems(data.items as ItemResponse[]);
      }
    } finally {
      setLoading(false);
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    await runSearch();
  }

  return (
    <div className="space-y-4">
      <LiquidGlass className="p-4">
        <form onSubmit={onSubmit} className="flex flex-col gap-3">
          <div className="flex gap-2">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search titles, descriptions, or semantically…"
            className="flex-1 px-3 py-2 rounded-lg bg-white/10 border border-white/20 text-white placeholder:text-white/40 focus:outline-none focus:border-white/40"
          />
          <button
            type="submit"
            disabled={loading || !q.trim()}
            className="px-4 py-2 rounded-lg bg-white/90 text-slate-900 font-medium hover:bg-white disabled:opacity-50"
          >
            {loading ? "Searching…" : "Search"}
          </button>
          </div>
          <label className="flex items-center gap-2 text-sm text-white/80 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={mineOnly}
              onChange={(e) => setMineOnly(e.target.checked)}
              className="rounded border-white/30"
            />
            Only posts I shared (includes items still categorizing)
          </label>
        </form>
      </LiquidGlass>

      {items === null ? (
        <div className="text-white/50 p-12 text-center text-sm">
          Hybrid search: full-text + fuzzy + semantic legs merged via RRF. Whole-space
          search includes your recent shares even while they are still categorizing
          (pending), as long as the URL is indexed.
        </div>
      ) : items.length === 0 ? (
        <div className="text-white/60 p-12 text-center text-sm">No results.</div>
      ) : (
        <MasonryGrid>
          {items.map((item) => (
            <ItemCard key={item.id} item={item} onChanged={runSearch} />
          ))}
        </MasonryGrid>
      )}
    </div>
  );
}
