import pool from "@/lib/db";
import { extractCanonical, type ItemKind } from "@/lib/canonical/extract";
import { normalizeUrl, urlHash } from "@/lib/canonical/normalize-url";

/**
 * Postit's 3-layer dedup:
 *   1. Canonical ID lookup (strongest): YouTube videoId, Spotify URI, Apple episodeId.
 *   2. URL-hash lookup: normalized URL → SHA-256 → match on items with null canonical_id.
 *   3. Embedding near-neighbor (runs after categorization): cosine distance ≤ threshold
 *      against other items of the same kind.
 *
 * Layers 1+2 run synchronously on POST (cheap hash lookups). Layer 3 runs inside the
 * categorization worker once the embedding exists.
 */

export type DedupOutcome =
  | { kind: "hit"; itemId: string }
  | {
      kind: "miss";
      itemKind: ItemKind;
      canonicalId: string | null;
      canonicalUrl: string;
      urlHash: Buffer;
    };

export async function dedupLookup(inputUrl: string): Promise<DedupOutcome> {
  const { kind, canonicalId } = extractCanonical(inputUrl);
  const canonicalUrl = normalizeUrl(inputUrl);
  const hash = urlHash(canonicalUrl);

  if (canonicalId) {
    // Layer 1: canonical ID match (subject to idx_items_canonical partial unique index).
    const { rows } = await pool.query<{ id: string }>(
      `SELECT id FROM items
       WHERE kind = $1 AND canonical_id = $2 AND merged_into IS NULL
       LIMIT 1`,
      [kind, canonicalId]
    );
    if (rows[0]) return { kind: "hit", itemId: rows[0].id };
  } else {
    // Layer 2: URL hash match (subject to idx_items_url_hash partial unique index).
    const { rows } = await pool.query<{ id: string }>(
      `SELECT id FROM items
       WHERE url_hash = $1 AND canonical_id IS NULL AND merged_into IS NULL
       LIMIT 1`,
      [hash]
    );
    if (rows[0]) return { kind: "hit", itemId: rows[0].id };
  }

  return {
    kind: "miss",
    itemKind: kind,
    canonicalId,
    canonicalUrl,
    urlHash: hash,
  };
}

/**
 * Layer 3: after an item's embedding is written, find the nearest existing item of
 * the same kind. Returns the neighbor's id if cosine distance is within `threshold`
 * (default 0.08 ≈ very similar), else null.
 *
 * Used by the categorization worker to soft-merge mirror uploads / equivalent URLs
 * we couldn't canonicalize via regex.
 */
export async function findEmbeddingNeighbor(
  itemId: string,
  kind: string,
  threshold = 0.08
): Promise<string | null> {
  const { rows } = await pool.query<{ id: string; dist: number }>(
    `WITH target AS (SELECT embedding FROM items WHERE id = $1)
     SELECT i.id, (i.embedding <=> target.embedding) AS dist
     FROM items i, target
     WHERE i.id <> $1
       AND i.kind = $2
       AND i.embedding IS NOT NULL
       AND i.merged_into IS NULL
       AND i.status = 'ready'
       AND target.embedding IS NOT NULL
     ORDER BY i.embedding <=> target.embedding
     LIMIT 1`,
    [itemId, kind]
  );
  const r = rows[0];
  if (!r) return null;
  if (Number(r.dist) <= threshold) return r.id;
  return null;
}
