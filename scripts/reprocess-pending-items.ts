/**
 * Re-run categorization for items stuck in `pending` (e.g. after you add
 * OPENAI_API_KEY to .env.local). New posts already kick the worker from
 * POST /api/items; this catches older rows.
 *
 * Usage: npm run items:reprocess-pending
 * Requires: DATABASE_URL (set by npm script), OPENAI_API_KEY in .env.local
 */

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

function loadEnvLocal(): void {
  const p = resolve(process.cwd(), ".env.local");
  if (!existsSync(p)) return;
  for (const raw of readFileSync(p, "utf8").split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const k = line.slice(0, eq).trim();
    let v = line.slice(eq + 1).trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    if (process.env[k] === undefined) process.env[k] = v;
  }
}

async function main(): Promise<void> {
  loadEnvLocal();

  if (!process.env.OPENAI_API_KEY?.trim()) {
    console.error(
      "OPENAI_API_KEY is missing. Add it to .env.local (never commit it), then run again."
    );
    process.exit(1);
  }

  const { default: pool } = await import("../src/lib/db");
  const { runItemCategorization } = await import(
    "../src/lib/jobs/run-item-categorization"
  );

  const { rows } = await pool.query<{ id: string }>(
    `SELECT id FROM items
     WHERE merged_into IS NULL AND status = 'pending'
     ORDER BY first_posted_at ASC`
  );

  if (rows.length === 0) {
    console.log("No pending items to process.");
    await pool.end();
    return;
  }

  console.log(`Processing ${rows.length} pending item(s)…`);
  for (const { id } of rows) {
    const r = await runItemCategorization(id);
    if (r.ok) {
      console.log(`  ✓ ${id} → ${r.outcome}`);
    } else {
      console.log(`  ✗ ${id} [${r.status}] ${r.message}`);
    }
  }
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
