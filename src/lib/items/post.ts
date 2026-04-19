import pool from "@/lib/db";
import { dedupLookup } from "./dedup";

/**
 * Orchestrator for POST /api/items. Wraps the synchronous part of ingest:
 *   1. Dedup lookup (canonical ID → URL hash).
 *   2. Hit path: attribute this poster to the existing item (merge-attribute).
 *   3. Miss path: insert new item, attribute poster, flag for async categorization.
 *
 * Returns quickly so the API route can respond 202 without waiting on OG fetch / LLM.
 * The caller is responsible for kicking off `runItemCategorization(itemId)` when
 * `deduped === false`.
 */

export interface PostItemInput {
  url: string;
  note?: string | null;
  userId: string;
}

export interface PostItemResult {
  itemId: string;
  /** true = existing item, poster added. false = brand new item, worker should run. */
  deduped: boolean;
}

export class InvalidUrlError extends Error {
  constructor(message = "Invalid URL") {
    super(message);
    this.name = "InvalidUrlError";
  }
}

export async function postItem(input: PostItemInput): Promise<PostItemResult> {
  const { url, note, userId } = input;
  if (!isLikelyItemUrl(url)) throw new InvalidUrlError();

  const sanitizedNote = sanitizeNote(note);
  const dedup = await dedupLookup(url);

  if (dedup.kind === "hit") {
    await upsertPoster(dedup.itemId, userId, sanitizedNote);
    return { itemId: dedup.itemId, deduped: true };
  }

  // Miss: insert new item. ON CONFLICT DO NOTHING handles the race where another
  // request inserted the same URL between our lookup and our insert.
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO items (kind, canonical_id, canonical_url, url_hash, status)
     VALUES ($1, $2, $3, $4, 'pending')
     ON CONFLICT DO NOTHING
     RETURNING id`,
    [dedup.itemKind, dedup.canonicalId, dedup.canonicalUrl, dedup.urlHash]
  );

  let itemId: string;
  let dedupedAfterRace = false;

  if (rows[0]) {
    itemId = rows[0].id;
  } else {
    // Race resolution: re-lookup, which must succeed now.
    const rematch = await dedupLookup(url);
    if (rematch.kind !== "hit") {
      throw new Error("dedup race unresolved — insert conflicted but lookup found nothing");
    }
    itemId = rematch.itemId;
    dedupedAfterRace = true;
  }

  await upsertPoster(itemId, userId, sanitizedNote);
  return { itemId, deduped: dedupedAfterRace };
}

async function upsertPoster(
  itemId: string,
  userId: string,
  note: string | null
): Promise<void> {
  await pool.query(
    `INSERT INTO item_posters (item_id, user_id, note)
     VALUES ($1, $2, $3)
     ON CONFLICT (item_id, user_id) DO UPDATE SET note = EXCLUDED.note`,
    [itemId, userId, note]
  );
}

/** Accepts https links and native `spotify:…` URIs handled by `extractCanonical`. */
function isLikelyItemUrl(raw: string): boolean {
  const t = raw.trim();
  if (/^spotify:(episode|track|show|album|playlist):[A-Za-z0-9]+$/i.test(t)) return true;
  return isLikelyHttpUrl(t);
}

function isLikelyHttpUrl(raw: string): boolean {
  try {
    const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    const u = new URL(withScheme);
    return (u.protocol === "http:" || u.protocol === "https:") && u.hostname.length > 0;
  } catch {
    return false;
  }
}

/**
 * Note sanitization — chat-prevention rails:
 *   - trim whitespace
 *   - cap at 280 chars
 *   - strip `@` from @-mentions (converts "@bob" → "bob") so notes can't be used as DMs
 */
function sanitizeNote(note: string | null | undefined): string | null {
  if (!note) return null;
  let n = note.trim();
  if (!n) return null;
  n = n.replace(/(^|\s)@(\w)/g, "$1$2");
  if (n.length > 280) n = n.slice(0, 280);
  return n;
}
