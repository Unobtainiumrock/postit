import { createHash } from "crypto";

/**
 * URL normalization for dedup:
 *   - force https:// scheme
 *   - lowercase host + strip leading www.
 *   - drop fragment (#...)
 *   - strip known tracking params (utm_*, fbclid, gclid, ref, ref_src, igshid, mc_*, mkt_tok, spm, scid)
 *   - sort remaining params alphabetically for determinism
 *   - drop trailing slash (but not the bare "/" path)
 *
 * Goal: any two URLs that point at the same content should normalize to the same string.
 */

const TRACKING_EXACT = new Set([
  "fbclid",
  "gclid",
  "ref",
  "ref_src",
  "ref_source",
  "source",
  "mkt_tok",
  "igshid",
  "spm",
  "scid",
  "yclid",
  "dclid",
  "_hsenc",
  "_hsmi",
]);

const TRACKING_PREFIX = [/^utm_/i, /^mc_/i];

function isTracking(key: string): boolean {
  const lower = key.toLowerCase();
  if (TRACKING_EXACT.has(lower)) return true;
  return TRACKING_PREFIX.some((re) => re.test(key));
}

export function normalizeUrl(raw: string): string {
  const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  const u = new URL(withScheme);

  u.protocol = "https:";
  u.hostname = u.hostname.toLowerCase().replace(/^www\./, "");
  u.hash = "";

  const kept: [string, string][] = [];
  u.searchParams.forEach((value, key) => {
    if (!isTracking(key)) kept.push([key, value]);
  });
  // Reset + re-add in sorted order for determinism.
  // (u.search = "" leaves the params intact in some runtimes; delete loop is safer.)
  [...u.searchParams.keys()].forEach((k) => u.searchParams.delete(k));
  kept.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  kept.forEach(([k, v]) => u.searchParams.append(k, v));

  let out = u.toString();
  // Drop trailing slash unless URL is just "https://host/"
  if (out.length > `${u.origin}/`.length && out.endsWith("/")) {
    out = out.slice(0, -1);
  }
  return out;
}

/** SHA-256 of the normalized URL, returned as a Node Buffer suitable for BYTEA in pg. */
export function urlHash(normalized: string): Buffer {
  return createHash("sha256").update(normalized).digest();
}
