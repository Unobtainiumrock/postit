/**
 * Seed `categories` from taxonomy/taxonomy.json.
 *
 * Idempotent: ON CONFLICT (slug) DO UPDATE refreshes name/description/sort_order
 * and clears deprecated_at. To remove a category: set `deprecated_at` directly in
 * the DB (we don't hard-delete — existing item_categories rows would break).
 *
 * Usage: npm run taxonomy:seed
 */

import pool from "../src/lib/db";
import { getTaxonomy } from "../src/lib/taxonomy/load";

async function seed(): Promise<void> {
  const taxonomy = getTaxonomy();
  let upserts = 0;

  for (let topIdx = 0; topIdx < taxonomy.categories.length; topIdx++) {
    const top = taxonomy.categories[topIdx];
    const { rows: topRow } = await pool.query<{ id: string }>(
      `INSERT INTO categories (slug, name, description, depth, sort_order)
       VALUES ($1, $2, $3, 1, $4)
       ON CONFLICT (slug) DO UPDATE
         SET name = EXCLUDED.name,
             description = EXCLUDED.description,
             sort_order = EXCLUDED.sort_order,
             deprecated_at = NULL
       RETURNING id`,
      [top.slug, top.name, top.description, topIdx]
    );
    upserts++;

    if (!top.children) continue;
    for (let childIdx = 0; childIdx < top.children.length; childIdx++) {
      const child = top.children[childIdx];
      await pool.query(
        `INSERT INTO categories (slug, parent_id, name, description, depth, sort_order)
         VALUES ($1, $2, $3, $4, 2, $5)
         ON CONFLICT (slug) DO UPDATE
           SET parent_id = EXCLUDED.parent_id,
               name = EXCLUDED.name,
               description = EXCLUDED.description,
               sort_order = EXCLUDED.sort_order,
               deprecated_at = NULL`,
        [child.slug, topRow[0].id, child.name, child.description, childIdx]
      );
      upserts++;
    }
  }

  console.log(
    `Seeded ${upserts} categories from taxonomy.json (version ${taxonomy.version})`
  );
  await pool.end();
}

seed().catch((err) => {
  console.error("Taxonomy seed failed:", err);
  process.exit(1);
});
