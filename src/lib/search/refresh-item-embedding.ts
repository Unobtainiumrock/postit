import pool from "@/lib/db";
import { buildEmbeddingDocument, type ItemRowForEmbed } from "./build-embedding-document";
import { embedText, vectorToPgLiteral } from "./embed-openai";

function parseJsonField<T>(v: unknown): T | null {
  if (v == null) return null;
  if (typeof v === "object") return v as T;
  if (typeof v === "string") {
    try {
      return JSON.parse(v) as T;
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * Recompute and store the embedding for an item. Called after categorization so
 * the embedding document includes the assigned category names. Swallows errors
 * (embedding is best-effort — the item is still usable without it, just not
 * discoverable via semantic search).
 */
export async function refreshItemEmbedding(itemId: string): Promise<void> {
  try {
    const { rows } = await pool.query<{
      id: string;
      title: string | null;
      description: string | null;
      canonical_url: string;
      kind: string;
      metadata: unknown;
    }>(
      `SELECT id, title, description, canonical_url, kind, metadata
       FROM items WHERE id = $1`,
      [itemId]
    );
    const row = rows[0];
    if (!row) return;

    const { rows: cats } = await pool.query<{ name: string }>(
      `SELECT c.name FROM item_categories ic
       JOIN categories c ON c.id = ic.category_id
       WHERE ic.item_id = $1
       ORDER BY c.name`,
      [itemId]
    );
    const categoryNames = cats.map((c) => c.name);

    const item: ItemRowForEmbed = {
      title: row.title,
      description: row.description,
      canonicalUrl: row.canonical_url,
      kind: row.kind,
      metadata: parseJsonField<Record<string, unknown>>(row.metadata),
    };

    const doc = buildEmbeddingDocument(item, categoryNames);
    if (!doc.trim()) {
      await pool.query(`UPDATE items SET embedding = NULL WHERE id = $1`, [itemId]);
      return;
    }

    const embedding = await embedText(doc);
    if (!embedding) return;

    const literal = vectorToPgLiteral(embedding);
    await pool.query(`UPDATE items SET embedding = $1::vector WHERE id = $2`, [literal, itemId]);
  } catch (e) {
    console.error("[refreshItemEmbedding]", itemId, e);
  }
}
