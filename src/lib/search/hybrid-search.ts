import pool from "@/lib/db";
import { embedText, vectorToPgLiteral } from "./embed-openai";

/**
 * Hybrid search + feed queries over `items`. Adapted from sharedboard:
 *   - No boardId (postit is a single global space).
 *   - Adds `mode` filter for the asymmetric feed: inbound / mine / archive / all.
 *   - Hybrid retrieval = FTS + pg_trgm fuzzy + pgvector cosine, merged via RRF.
 *
 * Feed mode semantics (applied as SQL predicates):
 *   inbound — items NOT posted by the viewer AND NOT consumed by the viewer
 *   mine    — items posted by the viewer (regardless of consumed state)
 *   archive — items consumed by the viewer (regardless of poster)
 *   all     — no viewer-scoped filter; used by search across the whole space
 */

const RRF_K = 60;
const PER_LEG = 40;
const TRGM_THRESHOLD = 0.35;
const MAX_COSINE_DISTANCE = 0.62;

export type FeedMode = "inbound" | "mine" | "archive" | "all";

function rrfMerge(lists: string[][]): string[] {
  const scores = new Map<string, number>();
  for (const list of lists) {
    list.forEach((id, index) => {
      const rank = index + 1;
      scores.set(id, (scores.get(id) ?? 0) + 1 / (RRF_K + rank));
    });
  }
  return [...scores.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([id]) => id);
}

/**
 * Feed visibility by processing state. Global modes only show `ready` so inbound
 * and search never surface half-processed rows. `mine` also lists the viewer's
 * `pending` / `failed` posts so a 202 submit is visible before enrichment finishes.
 */
function feedStatusWhere(mode: FeedMode): string {
  if (mode === "mine") {
    return `(i.status = 'ready' OR (
      i.status IN ('pending', 'failed')
      AND EXISTS (SELECT 1 FROM item_posters ip_mine WHERE ip_mine.item_id = i.id AND ip_mine.user_id = $1)
    ))`;
  }
  return `i.status = 'ready'`;
}

/** SQL fragment. Always references $1 as the viewer's user_id. */
function modeClause(mode: FeedMode): string {
  switch (mode) {
    case "inbound":
      return `
        AND NOT EXISTS (SELECT 1 FROM item_posters WHERE item_id = i.id AND user_id = $1)
        AND NOT EXISTS (SELECT 1 FROM item_consumed WHERE item_id = i.id AND user_id = $1)`;
    case "mine":
      return `AND EXISTS (SELECT 1 FROM item_posters WHERE item_id = i.id AND user_id = $1)`;
    case "archive":
      return `AND EXISTS (SELECT 1 FROM item_consumed WHERE item_id = i.id AND user_id = $1)`;
    case "all":
    default:
      return "";
  }
}

/** The item columns + joined aggregates every feed/search response needs. */
const ITEM_SELECT = `
  i.id, i.kind, i.canonical_id, i.canonical_url, i.title, i.description,
  i.thumbnail_url, i.duration_seconds, i.metadata, i.status,
  i.first_posted_at, i.created_at,
  COALESCE((
    SELECT json_agg(jsonb_build_object(
      'user_id', u.id,
      'handle', u.handle,
      'display_name', u.display_name,
      'avatar_url', u.avatar_url,
      'note', ip.note,
      'posted_at', ip.posted_at
    ) ORDER BY ip.posted_at)
    FROM item_posters ip JOIN users u ON u.id = ip.user_id
    WHERE ip.item_id = i.id
  ), '[]'::json) AS posters,
  COALESCE((
    SELECT json_agg(jsonb_build_object(
      'slug', c.slug,
      'name', c.name,
      'confidence', ic.confidence
    ))
    FROM item_categories ic JOIN categories c ON c.id = ic.category_id
    WHERE ic.item_id = i.id
  ), '[]'::json) AS categories,
  COALESCE((
    SELECT json_agg(jsonb_build_object(
      'user_id', u.id,
      'handle', u.handle,
      'consumed_at', ic.consumed_at
    ) ORDER BY ic.consumed_at)
    FROM item_consumed ic JOIN users u ON u.id = ic.user_id
    WHERE ic.item_id = i.id
  ), '[]'::json) AS consumed_by,
  EXISTS (SELECT 1 FROM item_consumed WHERE item_id = i.id AND user_id = $1) AS consumed_by_me,
  EXISTS (SELECT 1 FROM item_posters  WHERE item_id = i.id AND user_id = $1) AS posted_by_me
`;

// ─────────────────────────────────────────────────────────────────────────────
// Search (hybrid FTS + trgm + vector) — RRF-merged, re-hydrated.
// ─────────────────────────────────────────────────────────────────────────────

export interface SearchItemsParams {
  userId: string;
  search: string;
  mode?: FeedMode;
  categorySlug?: string | null;
  kind?: string | null;
}

export async function searchItemsHybrid(params: SearchItemsParams): Promise<unknown[]> {
  const { userId, search, mode = "all", categorySlug, kind } = params;
  const q = search.trim();
  if (!q) return [];

  const extraFilters: string[] = [];
  const textParams: (string | null)[] = [userId, q];
  const vecParamsBase: (string | null)[] = [userId]; // vec uses $2 for vector literal
  let textIdx = 3;
  let vecIdx = 3;

  if (categorySlug) {
    textParams.push(categorySlug);
    vecParamsBase.push(categorySlug);
    extraFilters.push(
      `AND EXISTS (SELECT 1 FROM item_categories ic JOIN categories c ON c.id = ic.category_id WHERE ic.item_id = i.id AND c.slug = $${textIdx})`
    );
    textIdx++;
    vecIdx++;
  }
  if (kind) {
    textParams.push(kind);
    vecParamsBase.push(kind);
    extraFilters.push(`AND i.kind = $${textIdx}`);
    textIdx++;
    vecIdx++;
  }

  const commonWhere = `
    ${feedStatusWhere(mode)} AND i.merged_into IS NULL
    ${modeClause(mode)}
    ${extraFilters.join("\n")}
  `;

  const lists: string[][] = [];

  // Leg 1: FTS
  try {
    const { rows } = await pool.query<{ id: string }>(
      `
      SELECT i.id FROM items i
      WHERE ${commonWhere}
        AND length(trim(COALESCE(i.search_document, ''))) > 0
        AND (
          to_tsvector('english', i.search_document) @@ websearch_to_tsquery('english', $2::text)
          OR to_tsvector('english', i.search_document) @@ plainto_tsquery('english', $2::text)
        )
      ORDER BY GREATEST(
        COALESCE(ts_rank_cd(to_tsvector('english', i.search_document), websearch_to_tsquery('english', $2::text)), 0),
        COALESCE(ts_rank_cd(to_tsvector('english', i.search_document), plainto_tsquery('english', $2::text)), 0)
      ) DESC, i.created_at DESC
      LIMIT ${PER_LEG}
      `,
      textParams
    );
    lists.push(rows.map((r) => r.id));
  } catch (e) {
    console.error("[search/fts]", e);
    lists.push([]);
  }

  // Leg 2: pg_trgm fuzzy
  try {
    const { rows } = await pool.query<{ id: string }>(
      `
      SELECT i.id FROM items i
      WHERE ${commonWhere}
        AND length(trim(COALESCE(i.search_document, ''))) > 0
        AND (
          word_similarity($2::text, i.search_document) > ${TRGM_THRESHOLD}
          OR i.search_document ILIKE '%' || $2::text || '%'
        )
      ORDER BY word_similarity($2::text, i.search_document) DESC NULLS LAST, i.created_at DESC
      LIMIT ${PER_LEG}
      `,
      textParams
    );
    lists.push(rows.map((r) => r.id));
  } catch (e) {
    console.error("[search/trgm]", e);
    lists.push([]);
  }

  // Leg 3: pgvector cosine
  const vec = await embedText(q);
  if (vec) {
    const literal = vectorToPgLiteral(vec);
    const vecParams = [vecParamsBase[0], literal, ...vecParamsBase.slice(1)];
    // vecParams: [$1 userId, $2 vector literal, $3… = categorySlug?, kind?]
    // We need to rebuild extra filters with vec indexing (same offsets because $2 still exists).
    try {
      const { rows } = await pool.query<{ id: string; dist: number }>(
        `
        SELECT i.id, (i.embedding <=> $2::vector) AS dist
        FROM items i
        WHERE ${commonWhere}
          AND i.embedding IS NOT NULL
        ORDER BY i.embedding <=> $2::vector
        LIMIT ${PER_LEG}
        `,
        vecParams
      );
      lists.push(
        rows.filter((r) => Number(r.dist) <= MAX_COSINE_DISTANCE).map((r) => r.id)
      );
    } catch (e) {
      console.error("[search/vec]", e);
      lists.push([]);
    }
  }

  const merged = rrfMerge(lists.filter((l) => l.length > 0));
  if (merged.length === 0) return [];

  const { rows } = await pool.query(
    `
    SELECT ${ITEM_SELECT}
    FROM items i
    JOIN unnest($2::uuid[]) WITH ORDINALITY AS ord(id, pos) ON ord.id = i.id
    ORDER BY ord.pos
    `,
    [userId, merged]
  );
  return rows;
}

// ─────────────────────────────────────────────────────────────────────────────
// Feed (no-search listing) — items by mode only, newest-first.
// ─────────────────────────────────────────────────────────────────────────────

export interface FeedItemsParams {
  userId: string;
  mode: FeedMode;
  categorySlug?: string | null;
  kind?: string | null;
  limit?: number;
  /** ISO timestamp cursor: return items with first_posted_at < before (for pagination). */
  before?: string | null;
}

export async function feedItems(params: FeedItemsParams): Promise<unknown[]> {
  const { userId, mode, categorySlug, kind, limit = 40, before } = params;

  const queryParams: (string | number | null)[] = [userId];
  let idx = 2;
  let where = `WHERE ${feedStatusWhere(mode)} AND i.merged_into IS NULL ${modeClause(mode)}`;

  if (categorySlug) {
    queryParams.push(categorySlug);
    where += ` AND EXISTS (SELECT 1 FROM item_categories ic JOIN categories c ON c.id = ic.category_id WHERE ic.item_id = i.id AND c.slug = $${idx})`;
    idx++;
  }
  if (kind) {
    queryParams.push(kind);
    where += ` AND i.kind = $${idx}`;
    idx++;
  }
  if (before) {
    queryParams.push(before);
    where += ` AND i.first_posted_at < $${idx}::timestamptz`;
    idx++;
  }

  queryParams.push(limit);
  const limitIdx = idx;

  const { rows } = await pool.query(
    `
    SELECT ${ITEM_SELECT}
    FROM items i
    ${where}
    ORDER BY i.first_posted_at DESC
    LIMIT $${limitIdx}
    `,
    queryParams
  );
  return rows;
}
