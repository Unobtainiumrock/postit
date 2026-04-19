# Postit

Invite-only PWA for a small group to share content (YouTube, Spotify, Apple Podcasts, articles). An LLM auto-classifies every post using a fixed taxonomy; a vector index powers semantic search. The feed is asymmetric — you mostly see what *others* brought in, to avoid clutter. No chat.

This project forks the reusable stack from `../sharedboard` (Next.js 16 + NextAuth v5 + Postgres/pgvector + OpenAI + next-pwa). **Design and status:** `docs/CURRENT_STATUS.md` (canonical for resuming work); this README is product + setup context.

---

## Local setup

```bash
# 1. Dependencies
npm install

# 2. Start Postgres with pgvector (Docker). Uses host port 5433 to avoid clashing
#    with sharedboard's 5432.
npm run db:up
npm run db:setup          # creates DB and loads schema.sql

# 3. Environment
cp .env.local.example .env.local
# edit .env.local:
#   - OPENAI_API_KEY = sk-...  (required for categorization + embeddings)
#   - NEXTAUTH_SECRET = $(openssl rand -base64 32)
#   - AUTH_SECRET     = <same value as NEXTAUTH_SECRET>  (Auth.js v5 reads this first)
#   - NEXT_PUBLIC_DEV_AUTH=true
#   - BOOTSTRAP_ADMIN_EMAIL=you@example.com
#     (first dev-mode signup using this email skips the invite-token gate AND gets is_admin)
#   - NEXTAUTH_URL must match the port `npm run dev` actually uses — if :3000
#     is taken on your host, Next falls back to :3001 and you must set
#     NEXTAUTH_URL=http://localhost:3001 or NextAuth callbacks drift.

# 4. Seed the fixed taxonomy into `categories`
npm run taxonomy:seed

# 5. Run
npm run dev
# Open the URL printed in the terminal (often :3000, or :3001 if 3000 is taken).
# First sign-in on a fresh DB: use BOOTSTRAP_ADMIN_EMAIL with an empty invite
# token to create the admin user, or use any email with a valid invite token.
```

In dev mode (`NEXT_PUBLIC_DEV_AUTH=true`) the login flow can upsert a user row from the email you submit. **Invite tokens are still required on first signup** unless the email matches `BOOTSTRAP_ADMIN_EMAIL` (case-insensitive) — that bootstrap user can then issue invites from the admin console.

## Production (AWS Amplify)

```bash
# Prints an AWS / Amplify env checklist (full unattended provisioner not bundled yet).
bash scripts/aws-provision.sh

# Then connect this repo to Amplify and set the same env vars from your console / secrets.
```

## Architecture (summary)

| Concern | Choice |
|---|---|
| Framework | Next.js 16 App Router |
| Auth | NextAuth v5: Cognito in prod, dev-credentials (email-only) in dev, invite-token gated |
| Database | Postgres 16 + pgvector + pg_trgm (RDS in prod) |
| LLM | OpenAI `gpt-4o-mini` (classification, JSON-schema constrained) + `text-embedding-3-small` (1536-dim) |
| Search | Hybrid: tsvector FTS + pg_trgm fuzzy + pgvector cosine, RRF-merged |
| PWA | `next-pwa` (Workbox precache + runtime caches) |
| Hosting | AWS Amplify |

## Key postit-specific concepts

- **Merge-attribute dedup.** Posting a URL that already exists doesn't create a duplicate — you're added to `item_posters` on the existing row. Your feed and archive reflect that you shared it; everyone else's feed still shows one card.
- **Fixed taxonomy.** `taxonomy/taxonomy.json` holds the entire 2-level category tree. The LLM is constrained via OpenAI structured outputs to pick from its leaf slugs — it cannot invent new ones. Admin edits happen through `/admin/taxonomy`.
- **Asymmetric feed.** The Inbound tab excludes the viewer's own posts. Posted-by-me and Archive tabs show their own content separately.
- **Chat-proof.** No standalone text blocks. Each share can carry an optional ≤280-char `note` attached to the link. No @-mentions, no edits, no reactions.
- **Fully visible consumption.** Once you mark an item consumed, its card shows `✓ @your-handle` to everyone else.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Next.js dev server on :3000 |
| `npm run build` | Production build |
| `npm run db:up` / `db:down` | Start/stop local Postgres container |
| `npm run db:setup` | Create DB + load `schema.sql` |
| `npm run db:reset` | Drop DB and rebuild |
| `npm run bootstrap:local` | **One command:** `db:up` + wait + `db:setup` + `taxonomy:seed` (needs Docker) |
| `npm run taxonomy:seed` | Seed `categories` from `taxonomy/taxonomy.json` |
| `npm run items:backfill-embeddings` | Recompute embeddings for items missing them |
| `npm run demo:seed` | Seed a handful of demo items via `postItem` (needs ≥1 user row) |
| `npm run lint` | ESLint |
| `bash scripts/aws-provision.sh` | Print AWS / Amplify provisioning checklist |

## Project status

The old phase checklist below this point had drifted behind the codebase. `postit`
is no longer at pure scaffolding.

Current implementation already includes:

- NextAuth wiring for dev credentials and Cognito-backed production auth
- invite-token issuance and redemption routes
- canonical URL extraction / normalization helpers and merge-attribute dedup
- `POST /api/items` plus in-process background categorization kickoff
- feed/search/report/taxonomy API routes
- feed, search, archive, mine, and admin app surfaces
- OpenAI embedding helpers and hybrid search over ready items

The current planning baseline is now the live queue plus the repo status note:

- `docs/CURRENT_STATUS.md` — **read this first** when resuming work. It tracks
  the live Priority Forge queue, local-dev gotchas hit during setup, and the
  concrete next steps.

High-priority work is no longer “port the basics.” It is:

- ~~reconcile docs and task notes with the actual implementation state~~ (done;
  see `docs/CURRENT_STATUS.md`)
- ~~audit and finish the item ingestion path end to end~~ (done in code; smoke-test
  in your DB, then treat the matching Priority Forge task as complete)
- continue admin polish, PWA + Amplify deploy, and staging auth verification (see
  `docs/CURRENT_STATUS.md` → *Current planned path*)
