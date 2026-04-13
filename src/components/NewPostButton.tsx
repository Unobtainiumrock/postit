"use client";

import { useState } from "react";
import LiquidGlass from "./LiquidGlass";

export default function NewPostButton() {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<"posted" | "deduped" | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch("/api/items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, note: note.trim() || null }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error || `Failed (${res.status})`);
        return;
      }
      const body = await res.json();
      setSuccess(body.deduped ? "deduped" : "posted");
      setTimeout(() => {
        setOpen(false);
        setUrl("");
        setNote("");
        setSuccess(null);
      }, 1200);
    } catch (err) {
      console.error(err);
      setError("Network error.");
    } finally {
      setBusy(false);
    }
  }

  const charsLeft = 280 - note.length;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label="New post"
        className="fixed bottom-8 right-8 z-40 w-14 h-14 rounded-full bg-white/95 text-slate-900 text-3xl font-light shadow-xl hover:bg-white active:scale-95 transition flex items-center justify-center"
      >
        +
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/50 backdrop-blur-sm"
          onClick={(e) => {
            if (e.target === e.currentTarget && !busy) setOpen(false);
          }}
        >
          <LiquidGlass className="p-6 w-full max-w-lg">
            <h2 className="text-xl font-semibold mb-4">Share something</h2>

            {success ? (
              <div className="py-8 text-center text-white/85">
                {success === "deduped" ? (
                  <>✓ Already on the board — you&rsquo;re attributed as a sharer.</>
                ) : (
                  <>✓ Posted. Categorizing in the background…</>
                )}
              </div>
            ) : (
              <form onSubmit={submit} className="flex flex-col gap-4">
                <label className="flex flex-col gap-1">
                  <span className="text-sm text-white/80">URL</span>
                  <input
                    type="url"
                    required
                    autoFocus
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    placeholder="https://…"
                    className="px-3 py-2 rounded-lg bg-white/10 border border-white/20 text-white placeholder:text-white/40 focus:outline-none focus:border-white/40"
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-sm text-white/80 flex justify-between">
                    <span>
                      Note{" "}
                      <span className="text-white/50">
                        (optional, ≤280 chars)
                      </span>
                    </span>
                    <span
                      className={
                        charsLeft < 0 ? "text-rose-300" : "text-white/40"
                      }
                    >
                      {charsLeft}
                    </span>
                  </span>
                  <textarea
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    rows={3}
                    placeholder="why you're sharing this (optional)"
                    className="px-3 py-2 rounded-lg bg-white/10 border border-white/20 text-white placeholder:text-white/40 focus:outline-none focus:border-white/40 resize-none"
                  />
                </label>
                {error && (
                  <div className="text-sm text-rose-200 bg-rose-900/30 border border-rose-500/30 px-3 py-2 rounded-lg">
                    {error}
                  </div>
                )}
                <div className="flex gap-2 justify-end">
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    className="px-4 py-2 rounded-lg text-white/70 hover:text-white"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={busy || !url || charsLeft < 0}
                    className="px-4 py-2 rounded-lg bg-white/90 text-slate-900 font-medium hover:bg-white disabled:opacity-50"
                  >
                    {busy ? "Posting…" : "Post"}
                  </button>
                </div>
              </form>
            )}
          </LiquidGlass>
        </div>
      )}
    </>
  );
}
