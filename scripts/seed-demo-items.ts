/**
 * Create a few demo shares via the same `postItem` path as `POST /api/items`
 * (merge-attribute dedup applies). Useful after you have at least one user row.
 *
 * Usage: npm run demo:seed
 * Requires: DATABASE_URL, at least one user (sign in once in dev to create one).
 * Optional: OPENAI_API_KEY — without it, new rows stay `pending` until enrichment runs.
 */

import pool from "../src/lib/db";
import { postItem, InvalidUrlError } from "../src/lib/items/post";

const DEMO_URLS = [
  "https://www.youtube.com/watch?v=jNQXAC9IVRw",
  "https://open.spotify.com/track/4iV5W9uYEdYUVa79Axb7Rh",
  "https://example.com/",
] as const;

async function main(): Promise<void> {
  const { rows: users } = await pool.query<{ id: string }>(
    "SELECT id FROM users ORDER BY created_at LIMIT 1"
  );
  if (!users[0]) {
    console.error(
      "No users in the database. Sign in once in dev (creates a user row), then re-run."
    );
    process.exit(1);
  }
  const userId = users[0].id;

  for (const url of DEMO_URLS) {
    try {
      const r = await postItem({ url, userId, note: "demo seed" });
      console.log(url, "→", r.deduped ? "deduped (poster added)" : "new item", r.itemId);
    } catch (e) {
      if (e instanceof InvalidUrlError) {
        console.warn("skip (invalid):", url);
      } else {
        throw e;
      }
    }
  }

  await pool.end();
}

main().catch((err) => {
  console.error("Demo seed failed:", err);
  process.exit(1);
});
