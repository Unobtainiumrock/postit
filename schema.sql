-- Postit Database Schema for local Postgres (pgvector/pgvector:pg16) and Amazon RDS.
-- Postit is a single-global-space content board with merge-attribute dedup and a
-- fixed LLM taxonomy. Plan-of-record: docs/CURRENT_STATUS.md (and README.md).

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";   -- fuzzy / similarity search
CREATE EXTENSION IF NOT EXISTS vector;      -- semantic search (pgvector)

-- ─── Users (synced from Cognito on first login) ───────────────────────────────
CREATE TABLE users (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  cognito_sub     VARCHAR(255) UNIQUE NOT NULL,
  email           VARCHAR(255) UNIQUE NOT NULL,
  handle          VARCHAR(64)  UNIQUE NOT NULL,
  display_name    VARCHAR(255) NOT NULL,
  avatar_url      TEXT,
  is_admin        BOOLEAN      NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ─── Invites (required for first-time signup; admin-issued) ──────────────────
CREATE TABLE invites (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  token           VARCHAR(64) UNIQUE NOT NULL,
  issued_by       UUID REFERENCES users(id) ON DELETE SET NULL,
  email           VARCHAR(255),          -- optional: lock token to a specific email
  max_uses        SMALLINT    NOT NULL DEFAULT 1,
  used_count      SMALLINT    NOT NULL DEFAULT 0,
  expires_at      TIMESTAMPTZ,
  revoked_at      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_invites_active
  ON invites(expires_at)
  WHERE revoked_at IS NULL AND used_count < max_uses;

-- ─── Categories (2-level tree, seeded from taxonomy/taxonomy.json) ────────────
CREATE TABLE categories (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  parent_id       UUID REFERENCES categories(id) ON DELETE CASCADE,
  slug            VARCHAR(128) UNIQUE NOT NULL,  -- e.g. "tech/ai-ml"
  name            VARCHAR(128) NOT NULL,
  description     TEXT,
  depth           SMALLINT     NOT NULL CHECK (depth IN (1, 2)),
  sort_order      INT          NOT NULL DEFAULT 0,
  deprecated_at   TIMESTAMPTZ,                   -- soft-delete; existing items keep link
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_categories_parent ON categories(parent_id);
CREATE INDEX idx_categories_depth  ON categories(depth, sort_order);

-- ─── Items (the shared content) ──────────────────────────────────────────────
CREATE TABLE items (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  kind              VARCHAR(24) NOT NULL CHECK (kind IN ('youtube','spotify','apple_podcast','url')),
  canonical_id      VARCHAR(255),           -- YouTube videoId, Spotify URI, Apple episodeId, etc.
  canonical_url     TEXT        NOT NULL,   -- normalized URL (lowercased host, no tracking params)
  url_hash          BYTEA       NOT NULL,   -- sha256(canonical_url) for constant-time dedup lookup
  title             VARCHAR(500),
  description       TEXT,
  thumbnail_url     TEXT,                   -- OG image URL (not re-hosted in v1)
  duration_seconds  INT,                    -- for videos / podcast episodes when known
  metadata          JSONB       NOT NULL DEFAULT '{}'::jsonb,
  embedding         vector(1536),           -- OpenAI text-embedding-3-small
  status            VARCHAR(16) NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','ready','failed','merged')),
  merged_into       UUID REFERENCES items(id) ON DELETE SET NULL,  -- set when soft-merged by NN dedup
  first_posted_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  search_document   TEXT
);

-- Dedup constraints: exactly one of (kind,canonical_id) OR url_hash uniquely identifies.
CREATE UNIQUE INDEX idx_items_canonical
  ON items (kind, canonical_id)
  WHERE canonical_id IS NOT NULL AND merged_into IS NULL;

CREATE UNIQUE INDEX idx_items_url_hash
  ON items (url_hash)
  WHERE canonical_id IS NULL AND merged_into IS NULL;

-- ─── Item posters (merge-attribute: many users per item) ─────────────────────
CREATE TABLE item_posters (
  item_id         UUID NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  note            VARCHAR(280),            -- optional per-share caption; chat-proof (≤280, no @mentions, no edits)
  posted_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (item_id, user_id)
);

CREATE INDEX idx_item_posters_user ON item_posters(user_id, posted_at DESC);

-- ─── Item categories (LLM-assigned, constrained to categories.slug enum) ─────
CREATE TABLE item_categories (
  item_id         UUID NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  category_id     UUID NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  source          VARCHAR(16) NOT NULL DEFAULT 'llm'
                  CHECK (source IN ('llm','admin','user')),
  confidence      REAL,
  assigned_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (item_id, category_id)
);

CREATE INDEX idx_item_categories_category ON item_categories(category_id);

-- ─── Item consumed (per-user state; fully visible to others via JOIN) ────────
CREATE TABLE item_consumed (
  item_id         UUID NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  consumed_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (item_id, user_id)
);

CREATE INDEX idx_item_consumed_user ON item_consumed(user_id, consumed_at DESC);

-- ─── Moderation ──────────────────────────────────────────────────────────────
CREATE TABLE reports (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  item_id         UUID NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  reporter_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reason          TEXT,
  status          VARCHAR(16) NOT NULL DEFAULT 'open'
                  CHECK (status IN ('open','resolved','dismissed')),
  resolved_by     UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at     TIMESTAMPTZ
);

CREATE INDEX idx_reports_status ON reports(status, created_at DESC);

CREATE TABLE audit_log (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  actor_id        UUID REFERENCES users(id) ON DELETE SET NULL,
  action          VARCHAR(64) NOT NULL,
  target          VARCHAR(128),
  metadata        JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_log_actor ON audit_log(actor_id, created_at DESC);

-- ─── Search document trigger (denormalized for FTS + pg_trgm) ───────────────
CREATE OR REPLACE FUNCTION items_set_search_document() RETURNS trigger AS $$
BEGIN
  NEW.search_document := trim(both ' ' FROM concat_ws(' ',
    NULLIF(btrim(COALESCE(NEW.title, '')), ''),
    NULLIF(btrim(COALESCE(NEW.description, '')), ''),
    NULLIF(btrim(COALESCE(NEW.canonical_url, '')), ''),
    NULLIF(btrim(COALESCE(NEW.kind, '')), '')
  ));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS items_search_document_tg ON items;
CREATE TRIGGER items_search_document_tg
  BEFORE INSERT OR UPDATE OF title, description, canonical_url, kind ON items
  FOR EACH ROW
  EXECUTE FUNCTION items_set_search_document();

-- ─── Indexes ─────────────────────────────────────────────────────────────────
CREATE INDEX idx_items_status_created ON items(status, created_at DESC);
CREATE INDEX idx_items_first_posted   ON items(first_posted_at DESC);

CREATE INDEX idx_items_search_fts  ON items USING gin (to_tsvector('english', search_document));
CREATE INDEX idx_items_search_trgm ON items USING gin (search_document gin_trgm_ops);

-- HNSW index is faster to build + query than ivfflat at small scales.
CREATE INDEX idx_items_embedding_hnsw
  ON items USING hnsw (embedding vector_cosine_ops)
  WHERE embedding IS NOT NULL;
