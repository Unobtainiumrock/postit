import { AuthenticationError } from "openai";
import pool from "@/lib/db";
import { categorizeItem } from "@/lib/llm/categorize";
import { refreshItemEmbedding } from "@/lib/search/refresh-item-embedding";
import { fetchOGMetadata } from "@/lib/og/fetch-metadata";
import { findEmbeddingNeighbor } from "@/lib/items/dedup";

/**
 * End-to-end async ingest pipeline for an item. Called in-process after POST /api/items
 * returns 202 (same pattern as sharedboard: in-process kickoff, not a separate worker
 * process). For postit at small scale this is fine; if we outgrow it we can move the
 * body to an SQS-triggered Lambda later.
 *
 * Steps:
 *   1. OG fetch → title/description/thumbnail backfill
 *   2. Categorize against the fixed taxonomy (JSON-schema constrained)
 *   3. Write item_categories rows
 *   4. Refresh embedding (after categories exist, so the doc includes them)
 *   5. Embedding NN dedup (layer 3) — merge into neighbor if cosine ≤ 0.08
 *   6. Mark status = 'ready' (or 'merged' if step 5 hit)
 */

export function openAINotConfiguredMessage(): string | null {
  const k = process.env.OPENAI_API_KEY?.trim();
  if (!k) {
    return "OPENAI_API_KEY is not set. Get one at https://platform.openai.com/api-keys and add it to .env.local.";
  }
  if (/^sk-your-/i.test(k)) {
    return "OPENAI_API_KEY is still a placeholder. Replace it with a real key.";
  }
  return null;
}

export type RunItemCategorizationResult =
  | { ok: true; outcome: "ready" | "merged"; itemId: string }
  | {
      ok: false;
      status: 401 | 404 | 500 | 503;
      code?: string;
      message: string;
    };

export async function runItemCategorization(
  itemId: string
): Promise<RunItemCategorizationResult> {
  const missingKey = openAINotConfiguredMessage();
  if (missingKey) {
    // Leave row in `pending` so configuring OPENAI_API_KEY later allows a retry
    // (e.g. admin script or a future "re-run enrichment" action).
    return {
      ok: false,
      status: 503,
      code: "openai_not_configured",
      message: missingKey,
    };
  }

  try {
    const { rows } = await pool.query<{
      id: string;
      kind: string;
      canonical_url: string;
      title: string | null;
      description: string | null;
      metadata: Record<string, unknown>;
    }>(
      `SELECT id, kind, canonical_url, title, description, metadata
       FROM items WHERE id = $1`,
      [itemId]
    );
    if (!rows[0]) return { ok: false, status: 404, message: "Item not found" };
    const item = rows[0];

    // ── 1. OG fetch (only if we don't already have title/description) ──────
    let title = item.title;
    let description = item.description;
    if (!title || !description) {
      const og = await fetchOGMetadata(item.canonical_url);
      title = title ?? og.title;
      description = description ?? og.description;
      await pool.query(
        `UPDATE items
         SET title = COALESCE(title, $1),
             description = COALESCE(description, $2),
             thumbnail_url = COALESCE(thumbnail_url, $3),
             metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{og}', $4::jsonb, true)
         WHERE id = $5`,
        [og.title, og.description, og.image, JSON.stringify(og), itemId]
      );
    }

    // ── 2. Classify against the fixed taxonomy ─────────────────────────────
    const result = await categorizeItem({
      title,
      description,
      canonicalUrl: item.canonical_url,
      kind: item.kind,
    });

    // ── 3. Insert category assignments ─────────────────────────────────────
    for (const slug of result.categorySlugs) {
      const { rows: catRows } = await pool.query<{ id: string }>(
        `SELECT id FROM categories WHERE slug = $1 AND deprecated_at IS NULL`,
        [slug]
      );
      if (!catRows[0]) continue; // slug not in DB (drift between taxonomy.json and seeded table)
      await pool.query(
        `INSERT INTO item_categories (item_id, category_id, source, confidence)
         VALUES ($1, $2, 'llm', $3)
         ON CONFLICT (item_id, category_id)
         DO UPDATE SET confidence = EXCLUDED.confidence, source = 'llm'`,
        [itemId, catRows[0].id, result.confidence]
      );
    }

    // Fill in description from LLM summary if still missing
    if (result.summary && !description) {
      await pool.query(`UPDATE items SET description = $1 WHERE id = $2`, [
        result.summary,
        itemId,
      ]);
    }

    // ── 4. Refresh embedding (includes categories in the doc) ──────────────
    await refreshItemEmbedding(itemId);

    // ── 5. Embedding NN dedup (layer 3) ────────────────────────────────────
    const neighborId = await findEmbeddingNeighbor(itemId, item.kind);
    if (neighborId) {
      await mergeIntoNeighbor(itemId, neighborId);
      return { ok: true, outcome: "merged", itemId: neighborId };
    }

    // ── 6. Mark ready ──────────────────────────────────────────────────────
    await pool.query(`UPDATE items SET status = 'ready' WHERE id = $1`, [itemId]);
    return { ok: true, outcome: "ready", itemId };
  } catch (err) {
    await markFailed(itemId);
    if (err instanceof AuthenticationError) {
      return {
        ok: false,
        status: 401,
        code: "openai_invalid_key",
        message: "OpenAI rejected the API key (401). Check OPENAI_API_KEY.",
      };
    }
    console.error("[runItemCategorization]", itemId, err);
    return { ok: false, status: 500, message: "Categorization failed" };
  }
}

async function markFailed(itemId: string): Promise<void> {
  try {
    await pool.query(
      `UPDATE items SET status = 'failed' WHERE id = $1 AND status = 'pending'`,
      [itemId]
    );
  } catch {
    /* noop */
  }
}

async function mergeIntoNeighbor(newerId: string, olderId: string): Promise<void> {
  // Move posters onto the older (canonical) item; older row wins.
  await pool.query(
    `INSERT INTO item_posters (item_id, user_id, note, posted_at)
     SELECT $2, user_id, note, posted_at FROM item_posters WHERE item_id = $1
     ON CONFLICT (item_id, user_id) DO NOTHING`,
    [newerId, olderId]
  );
  // Move category assignments too (keep higher confidence on conflict).
  await pool.query(
    `INSERT INTO item_categories (item_id, category_id, source, confidence)
     SELECT $2, category_id, source, confidence FROM item_categories WHERE item_id = $1
     ON CONFLICT (item_id, category_id) DO UPDATE
       SET confidence = GREATEST(item_categories.confidence, EXCLUDED.confidence)`,
    [newerId, olderId]
  );
  // Flag the newer row as merged; it'll be excluded from all feeds by `merged_into IS NULL`.
  await pool.query(
    `UPDATE items SET merged_into = $2, status = 'merged' WHERE id = $1`,
    [newerId, olderId]
  );
}
