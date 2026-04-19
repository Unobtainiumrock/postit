/**
 * Canonical identifier extraction for known content hosts. Postit uses this as the
 * strongest dedup signal: YouTube videoIds, Spotify URIs, Apple Podcasts episodeIds
 * are platform-stable and survive URL variations (query params, path variants, mobile hosts).
 *
 * Returns kind='url' and canonicalId=null for anything else — the URL-hash layer takes over.
 */

export type ItemKind = "youtube" | "spotify" | "apple_podcast" | "url";

export interface CanonicalExtractResult {
  kind: ItemKind;
  canonicalId: string | null;
}

function safeUrl(raw: string): URL | null {
  try {
    const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    return new URL(withScheme);
  } catch {
    return null;
  }
}

export function extractCanonical(input: string): CanonicalExtractResult {
  const trimmed = input.trim();

  // Native Spotify app URIs (no https host) — same dedup key as open.spotify.com links.
  const spotifyNative = trimmed.match(/^spotify:(episode|track|show|album|playlist):([A-Za-z0-9]+)$/i);
  if (spotifyNative) {
    return {
      kind: "spotify",
      canonicalId: `spotify:${spotifyNative[1].toLowerCase()}:${spotifyNative[2]}`,
    };
  }

  const u = safeUrl(trimmed);
  if (!u) return { kind: "url", canonicalId: null };

  const host = u.hostname.toLowerCase().replace(/^www\./, "");

  // ── YouTube ────────────────────────────────────────────────────────────────
  // Forms: youtube.com/watch?v=ID, youtu.be/ID, youtube.com/shorts/ID,
  //        youtube.com/embed/ID, m.youtube.com/watch?v=ID
  if (host === "youtube.com" || host === "m.youtube.com" || host === "music.youtube.com") {
    if (u.pathname === "/watch") {
      const v = u.searchParams.get("v");
      if (v && /^[A-Za-z0-9_-]{6,}$/.test(v)) return { kind: "youtube", canonicalId: v };
    }
    const shorts = u.pathname.match(/^\/shorts\/([A-Za-z0-9_-]{6,})/);
    if (shorts) return { kind: "youtube", canonicalId: shorts[1] };
    const embed = u.pathname.match(/^\/embed\/([A-Za-z0-9_-]{6,})/);
    if (embed) return { kind: "youtube", canonicalId: embed[1] };
    const live = u.pathname.match(/^\/live\/([A-Za-z0-9_-]{6,})/);
    if (live) return { kind: "youtube", canonicalId: live[1] };
  }
  if (host === "youtu.be") {
    const m = u.pathname.match(/^\/([A-Za-z0-9_-]{6,})/);
    if (m) return { kind: "youtube", canonicalId: m[1] };
  }

  // ── Spotify ────────────────────────────────────────────────────────────────
  // Forms: open.spotify.com/{episode|track|show|album|playlist}/ID
  // We only canonicalize the first-class content types; episode + track are the main ones.
  if (host === "open.spotify.com" || host === "spotify.com") {
    const m = u.pathname.match(/^\/(episode|track|show|album|playlist)\/([A-Za-z0-9]+)/);
    if (m) return { kind: "spotify", canonicalId: `spotify:${m[1]}:${m[2]}` };
  }

  // ── Apple Podcasts ─────────────────────────────────────────────────────────
  // Forms: podcasts.apple.com/<locale>/podcast/<slug>/id<showId>?i=<episodeId>
  // Episode form (with ?i=) is strongly preferred as the dedup key; show-only uses "show:<id>".
  if (host === "podcasts.apple.com" || host === "music.apple.com") {
    const episodeId = u.searchParams.get("i");
    if (episodeId && /^\d+$/.test(episodeId)) {
      return { kind: "apple_podcast", canonicalId: episodeId };
    }
    const showId = u.pathname.match(/\/id(\d+)/);
    if (showId) return { kind: "apple_podcast", canonicalId: `show:${showId[1]}` };
  }

  // ── Fallback: generic URL, no canonical id ────────────────────────────────
  return { kind: "url", canonicalId: null };
}
