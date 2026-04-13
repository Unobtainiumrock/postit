"use client";

import { useCallback, useEffect, useState } from "react";
import MasonryGrid from "./MasonryGrid";
import ItemCard from "./ItemCard";
import type { ItemResponse } from "@/lib/items/types";

const EMPTY_COPY: Record<string, string> = {
  inbound:
    "Nothing in your inbound yet. Invite someone, or wait for others to post.",
  mine: "You haven't shared anything yet. Tap the + to post a link.",
  archive: "You haven't marked anything consumed yet.",
};

export default function FeedView({
  mode,
}: {
  mode: "inbound" | "mine" | "archive";
}) {
  const [items, setItems] = useState<ItemResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/items?mode=${mode}`, { cache: "no-store" });
      if (!res.ok) throw new Error(String(res.status));
      const data = await res.json();
      setItems(data.items as ItemResponse[]);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [mode]);

  useEffect(() => {
    load();
    const intervalId = setInterval(load, 20_000);
    const onFocus = () => load();
    window.addEventListener("focus", onFocus);
    return () => {
      clearInterval(intervalId);
      window.removeEventListener("focus", onFocus);
    };
  }, [load]);

  if (loading) {
    return <div className="text-white/60 p-12 text-center text-sm">Loading…</div>;
  }
  if (error) {
    return (
      <div className="text-rose-200 p-8 text-center text-sm">
        Error: {error}
      </div>
    );
  }
  if (items.length === 0) {
    return (
      <div className="text-white/60 p-12 text-center">
        {EMPTY_COPY[mode] || "Nothing here."}
      </div>
    );
  }

  return (
    <MasonryGrid>
      {items.map((item) => (
        <ItemCard key={item.id} item={item} onChanged={load} />
      ))}
    </MasonryGrid>
  );
}
