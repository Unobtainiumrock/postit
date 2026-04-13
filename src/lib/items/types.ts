/**
 * Shared response shape for items from the API. Mirrors the ITEM_SELECT projection
 * in src/lib/search/hybrid-search.ts — keep in sync when columns change.
 */

export type ItemKind = "youtube" | "spotify" | "apple_podcast" | "url";
export type ItemStatus = "pending" | "ready" | "failed" | "merged";

export interface PosterRef {
  user_id: string;
  handle: string;
  display_name: string;
  avatar_url: string | null;
  note: string | null;
  posted_at: string;
}

export interface CategoryRef {
  slug: string;
  name: string;
  confidence: number | null;
}

export interface ConsumerRef {
  user_id: string;
  handle: string;
  consumed_at: string;
}

export interface ItemResponse {
  id: string;
  kind: ItemKind;
  canonical_id: string | null;
  canonical_url: string;
  title: string | null;
  description: string | null;
  thumbnail_url: string | null;
  duration_seconds: number | null;
  metadata: Record<string, unknown>;
  status: ItemStatus;
  first_posted_at: string;
  created_at: string;
  posters: PosterRef[];
  categories: CategoryRef[];
  consumed_by: ConsumerRef[];
  consumed_by_me: boolean;
  posted_by_me: boolean;
}
