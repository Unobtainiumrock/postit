/**
 * Recompute pgvector embeddings for `ready` items that have searchable text but
 * no embedding yet (e.g. pre-embedding data or failed best-effort writes).
 *
 * Usage: npm run items:backfill-embeddings
 * Requires: DATABASE_URL, OPENAI_API_KEY
 */

import pool from "../src/lib/db";
import { refreshItemEmbedding } from "../src/lib/search/refresh-item-embedding";

async function main(): Promise<void> {
  if (!process.env.OPENAI_API_KEY?.trim()) {
    console.error("OPENAI_API_KEY is required for embedding backfill.");
    process.exit(1);
  }

  const { rows } = await pool.query<{ id: string }>(
    `SELECT id FROM items
     WHERE merged_into IS NULL
       AND status = 'ready'
       AND embedding IS NULL
       AND COALESCE(NULLIF(trim(search_document), ''), NULL) IS NOT NULL
     ORDER BY created_at`
  );

  if (rows.length === 0) {
    console.log("No items need embedding backfill.");
    await pool.end();
    return;
  }

  console.log(`Backfilling embeddings for ${rows.length} item(s)...`);
  let ok = 0;
  for (const { id } of rows) {
    await refreshItemEmbedding(id);
    const { rows: check } = await pool.query<{ has: boolean }>(
      `SELECT embedding IS NOT NULL AS has FROM items WHERE id = $1`,
      [id]
    );
    if (check[0]?.has) ok++;
    process.stdout.write(".");
  }
  console.log(`\nDone. ${ok}/${rows.length} row(s) now have an embedding.`);
  await pool.end();
}

main().catch((err) => {
  console.error("Backfill failed:", err);
  process.exit(1);
});
