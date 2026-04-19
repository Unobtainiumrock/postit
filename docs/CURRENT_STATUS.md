# Postit Current Status

This document is the canonical status note for `postit` until the README and
Priority Forge queue are fully back in sync.

It is intentionally driven by the active `postit` queue items plus the live
local-dev findings, not by the older phase checklist that used to live in
`README.md`.

> **Last verification pass: 2026-04-19.** `./node_modules/.bin/tsc --noEmit` is
> clean. Ingestion-path audit closed in-repo: native Spotify URIs + stable
> `canonical_url` for Spotify/YouTube, `music.apple.com` episode parsing,
> **mine** feed includes the poster’s `pending` / `failed` rows, and missing
> `OPENAI_API_KEY` no longer flips new items to `failed` (stays `pending` for
> retry). Priority Forge v4 lists tasks at `GET http://127.0.0.1:3456/tasks`
> (filter `project === "postit"` in jq); there is no `/priorities` route.

## Resume prompt for a fresh AI agent

If you are coming to this repo cold and have an AI coding assistant (Claude
Code, Codex, Cursor, Droid), paste this prompt to it as your first message:

> You are picking up the `postit` project after a fresh `git clone`. Do this in order:
>
> 1. Read `docs/CURRENT_STATUS.md` end to end. Treat it as the plan of record. The README's older phase checklist has been replaced — do not reconstruct intent from it.
> 2. Skim `README.md` for product context (what postit *is*).
> 3. Follow the section "Priority Forge install + task reconstruction (for a new machine)" near the bottom of `docs/CURRENT_STATUS.md` to install Priority Forge, wire it to me, and restart me so the MCP tools load.
> 4. Run the one-shot seed script: `bash scripts/seed-postit-tasks.sh`. It creates the three postit-tagged tasks this doc references and then **self-deletes**. Commit the deletion: `git add scripts/seed-postit-tasks.sh && git commit -m 'Remove one-shot seed script after first-time setup'`.
> 5. Confirm the seed worked: `curl -s http://127.0.0.1:3456/tasks` and count tasks with `"project":"postit"` (expect three: one P1 in_progress umbrella, one P1 in_progress ingestion audit, one P2 environment-only). Forge v4 has no `/priorities` HTTP route.
> 6. Read `~/Desktop/github/priority-forge/AGENT_RULES.md` once. That is the task tracking protocol you should follow during the work (mark `in_progress` before starting, ask for reasoning when deprioritizing/deferring, etc.).
> 7. The active spine of work is the P1 in_progress task "Audit and finish postit item ingestion path across auth, dedup, API routes, and background enrichment". Drive it to done per the "Practical interpretation of the queue" and "Current planned path" sections in `docs/CURRENT_STATUS.md` before opening new feature work.
>
> If `npm run dev` falls back to port 3001, set `NEXTAUTH_URL=http://localhost:3001` in `.env.local`. See "Local-dev gotchas already hit" for the rest of the booby traps that have already been mapped.

## Active queue items (Priority Forge, `postit` project)

Task **UUIDs are local** to each machine — after `scripts/seed-postit-tasks.sh`
they appear in `GET http://127.0.0.1:3456/tasks` with `project: "postit"`. The
intended queue shape is:

1. **P1, in_progress** — umbrella: `Build postit v1 — fork sharedboard, link-only
   PWA with merge-attribute dedup, fixed taxonomy, asymmetric feed`
2. **P1, in_progress** — `Audit and finish postit item ingestion path across auth,
   dedup, API routes, and background enrichment` (drive to **complete** in Forge
   once you have verified behavior in your environment)
3. **P2, not_started** — `Verify Codex sandbox/userns fix after AppArmor sysctl
   override` (environment-only; does not block product work)

Already closed in the forge (do **not** treat as active anymore, even though an
earlier version of this note listed it):

- `4cccdd17-74b9-400a-a638-4553036686ab` — `Reconcile postit phase/task
  documentation drift …` → **complete**. This document *is* that reconciliation.
- `POSTIT-P1…P4` — Phases 1–4 are all **complete** per the forge. No remaining
  phase-level subtasks are open; `POSTIT-P5` (admin console) and `POSTIT-P6`
  (polish + AWS deploy) were never materialized as standalone tasks and are
  implicitly rolled up under the umbrella `79627545…`.

## What is actually implemented

The repo already contains more than “scaffolding only.”

Confirmed implemented surfaces in the codebase:

- auth layer
  - `src/lib/auth.ts`
  - dev credentials flow
  - Cognito provider wiring
  - invite-token gated first signup, with `BOOTSTRAP_ADMIN_EMAIL` bypass
  - **quiet logger** for `JWTSessionError` so stale-cookie events don't spam
    the Next.js dev overlay
  - explicit `secret` bound to `AUTH_SECRET ?? NEXTAUTH_SECRET`
- invite APIs
  - `src/app/api/invites/route.ts`
  - `src/app/api/invites/[id]/route.ts`
  - `src/app/api/invites/[id]/redeem/route.ts` (was `[token]/redeem` — renamed
    to share the `[id]` segment name and unblock the Next 16 App Router, which
    rejects sibling dynamic segments with different names)
- item ingestion path
  - `src/app/api/items/route.ts`
  - `src/lib/items/post.ts`
  - `src/lib/items/dedup.ts`
  - `src/lib/canonical/extract.ts` (incl. native `spotify:…` URIs, `music.apple.com`)
  - `src/lib/canonical/normalize-url.ts` (`stableIngestCanonicalUrl` for Spotify/YouTube)
  - `src/lib/jobs/run-item-categorization.ts`
  - `src/lib/search/hybrid-search.ts` (`mine` shows poster’s `pending` / `failed` items)
- search / embeddings
  - `src/lib/search/embed-openai.ts`
  - `src/lib/search/build-embedding-document.ts`
  - `src/lib/search/refresh-item-embedding.ts`
  - `src/lib/search/hybrid-search.ts`
  - `src/app/api/search/route.ts`
- app surface
  - `src/app/(app)/inbound/page.tsx`
  - `src/app/(app)/mine/page.tsx`
  - `src/app/(app)/archive/page.tsx`
  - `src/app/(app)/search/page.tsx`
  - `src/app/(app)/admin/page.tsx`
  - `src/components/FeedView.tsx`
  - `src/components/ItemCard.tsx`
  - `src/components/LiquidGlass.tsx`
  - `src/components/AdminClient.tsx`
  - `src/components/LoginForm.tsx` (now hits `/api/auth/session` on mount so
    stale NextAuth cookies can be cleared — RSC `auth()` cannot emit Set-Cookie)
- moderation / reporting / taxonomy
  - `src/app/api/reports/route.ts`
  - `src/app/api/reports/[id]/route.ts`
  - `src/app/api/items/[id]/report/route.ts`
  - `src/app/api/taxonomy/route.ts`
- build config
  - `next.config.ts` now declares `turbopack: {}`; Next 16 defaults to Turbopack
    and refuses to start silently with `next-pwa`'s webpack hook otherwise

## Local-dev gotchas already hit (document here so the next agent doesn't rediscover)

These are **not** blocking bugs but they are non-obvious and waste time on
first run:

- **Port 3000 is frequently taken** on this host (another dev server ran
  there). `npm run dev` auto-falls back to **3001**. If you use 3001 you
  **must** set `NEXTAUTH_URL=http://localhost:3001` in `.env.local` or
  NextAuth callbacks drift.
- **`NEXTAUTH_SECRET` vs `AUTH_SECRET`.** Auth.js v5 reads `AUTH_SECRET` first.
  `.env.local` now sets **both to the same value** and `src/lib/auth.ts` passes
  `secret` explicitly. The three-banner dev overlay `JWTSessionError` /
  `no matching decryption secret` / `{}` is the **same** event — a stale
  cookie encrypted with a rotated secret — and the custom logger swallows it.
  If a user still sees it, they should hard-refresh once to drop the bad
  cookie.
- **Login without an invite token** only works when the email matches
  `BOOTSTRAP_ADMIN_EMAIL` (case-insensitive). The README wording is correct;
  the login page does not say this out loud. First bootstrap in a fresh DB:
  set `BOOTSTRAP_ADMIN_EMAIL=you@example.com` in `.env.local`, use that email,
  leave "Invite token" blank.
- **`schema.sql` is not idempotent.** It uses raw `CREATE TABLE` / `CREATE
  INDEX`, not `CREATE … IF NOT EXISTS`. Re-running `npm run db:setup` on a
  populated DB spams `ERROR: relation "…" already exists` but the script
  keeps going. This is harmless today but is a **real papercut for the
  ingestion audit task**: if someone is iterating on `schema.sql` they cannot
  just rerun `db:setup`; they must `db:reset` (which drops the database).
- **`npm run taxonomy:seed`** currently prints
  `Seeded 58 categories from taxonomy.json (version 1)` — single counter, not
  the "`10 top-level + 47 leaves`" breakdown that floats around in older chat
  transcripts. If the breakdown is desired, it has to be added to
  `scripts/seed-taxonomy.ts`.
- **Turbopack "multiple lockfiles" warning.** There is a `package-lock.json`
  in `/home/unobtainium/Desktop/github/` (parent dir). Turbopack picks that
  as the workspace root and warns. Non-fatal, but set `turbopack.root` in
  `next.config.ts` (or remove the parent lockfile) when you care.

## What is still not settled

The **ingest path is implemented and hardened in code** (dedup layers 1–2,
merge-attribute posters, `POST` 200/202, in-process categorization + layer-3
embedding merge, **mine**-only visibility for `pending` / `failed`). Remaining
work is mostly **your-environment verification** (real Cognito, real OpenAI,
concurrency under load) and product polish outside this spine.

Still worth tracking:

- auth flow correctness across dev bootstrap, invite redemption, and
  existing-user re-entry (manual / staging verification)
- `schema.sql` idempotency (see gotcha above) — consider `IF NOT EXISTS` or
  migration split
- README vs scripts parity and UI polish (admin, PWA deploy) as separate tasks

## Practical interpretation of the queue

- Umbrella (P1): keep the broader v1 vision in view; next product tranche is
  admin polish, PWA + deploy, and runtime verification — not greenfield ingest.
- Ingest audit (P1): **code side addressed in-repo (2026-04-19).** Mark the
  matching Forge task **complete** after you smoke-test `POST /api/items` and
  feeds in your dev DB.
- Codex userns (P2): environment-only, unblock later.

## Current planned path

1. Keep this document and the README aligned with the actual implementation.
2. ~~Audit the ingestion path end to end~~ **Done in code** — see verification
   note at top; close the Forge ingestion task after local smoke tests.
3. Next tranche: admin console polish, PWA + Amplify deploy, staging auth checks,
   and README/script parity — described without reviving stale `POSTIT-P5` /
   `POSTIT-P6` phase names unless you recreate those tasks in Forge.

## Where to resume (after the most recent local-dev session)

State on disk when this note was written:

- `.env.local` exists and has: `NEXTAUTH_URL=http://localhost:3001`,
  matching `NEXTAUTH_SECRET` / `AUTH_SECRET`, `NEXT_PUBLIC_DEV_AUTH=true`,
  `DATABASE_URL=postgresql://postgres:password@localhost:5433/postit`,
  `BOOTSTRAP_ADMIN_EMAIL=you@example.com`, `OPENAI_API_KEY` **still empty**.
- Docker container `postgres_postit` is up; schema + taxonomy are loaded
  (`npm run taxonomy:seed` → 58 rows).
- Dev server runs via `npm run dev` on **:3001** (port 3000 taken on host).
- No user has actually signed in yet against this DB — the first login using
  `BOOTSTRAP_ADMIN_EMAIL` will create the admin row.

Next concrete steps when resuming:

1. Sign in once with `you@example.com` (no invite token needed) to create the
   bootstrap admin.
2. Set `OPENAI_API_KEY` in `.env.local` before exercising any flow that hits
   categorization or embeddings (`POST /api/items`, search).
3. Pick up forge task `4e74595f…` and drive the ingestion audit.

## Priority Forge install + task reconstruction (for a new machine)

This document references Priority Forge tasks by UUID. Those UUIDs are local to
the machine that originally created them; on a fresh machine you will get your
own. Use this section to (1) install Priority Forge and (2) reconstitute the
postit task queue with your own IDs so the `4e74595f…` / `79627545…` /
`1de27ddc…` references above resolve to *your* equivalents.

### 1. Install Priority Forge

```bash
git clone https://github.com/Unobtainiumrock/priority-forge ~/Desktop/github/priority-forge
cd ~/Desktop/github/priority-forge
npm install

# Backend on :3456 (MCP + REST), frontend on :5173. The repo's setup.sh
# installs systemd (Linux) or launchd (macOS) services so both auto-start
# on boot.
bash setup.sh

# Verify
curl http://127.0.0.1:3456/health    # → {"status":"ok",...}
# Open http://localhost:5173 in a browser for the dashboard.
```

### 2. Wire your AI tool to Priority Forge

`npm run setup:mcp` is interactive. Pick the option for your tool:

```
[1] Cursor             — HTTP, ~/.cursor/mcp.json
[2] Droid (Factory)    — HTTP, ~/.factory/mcp.json
[3] Claude Code CLI    — HTTP via .mcp.json (default; stdio fallback via
                         PRIORITY_FORGE_USE_STDIO=1 if HTTP ever regresses)
[4] OpenAI Codex CLI   — HTTP via [mcp_servers.priority-forge] in
                         ~/.codex/config.toml
```

Then restart the AI tool. After restart, MCP tools named `get_top_priority`,
`get_priorities`, `create_task`, `update_task`, `complete_task`, `log_decision`
etc. will be available (Claude Code prefixes them as
`mcp__priority-forge__<name>`; Codex uses the bare name). The canonical agent
protocol that ships with Priority Forge is
`~/Desktop/github/priority-forge/AGENT_RULES.md` — read it once.

If MCP is not your thing or you prefer scripts, the same operations are
available as REST under `http://127.0.0.1:3456/tasks` (POST to create, PUT to
update, GET to list). The `npm run setup:mcp` step is optional for that path.

### 3. Recreate the postit task queue

Run the one-shot seed script:

```bash
bash scripts/seed-postit-tasks.sh
```

It does three things, in order:

1. Refuses to run if Priority Forge isn't reachable on `http://127.0.0.1:3456` (so you can't seed against a stale or missing backend).
2. Creates the three postit-tagged tasks this document references (umbrella, ingestion audit, Codex userns).
3. Deletes itself. The script is single-use — once it runs, commit the deletion:
   ```bash
   git add scripts/seed-postit-tasks.sh
   git commit -m "Remove one-shot seed script after first-time setup"
   ```
   If you ever need to re-seed, restore from git history (`git checkout HEAD~ -- scripts/seed-postit-tasks.sh`).

Notes inside the seed script have been lightly edited from the original
queue to drop a stale plan-file reference (`~/.claude/plans/stateless-seeking-flurry.md`
was overwritten with unrelated content and is not recoverable). This
`CURRENT_STATUS.md` is now the plan-of-record.

After seeding:

- `curl -s http://127.0.0.1:3456/tasks` (or the dashboard at `:5173`) should
  include three `postit`-project tasks.
- Your AI agent's first action on a new conversation will be
  `get_top_priority`, which will surface the active P1 in_progress task and
  let you resume cleanly from this document.



Trust this instead:

- the repo already has the major structural surfaces for auth, invites, items,
  feeds, search, reports, taxonomy, and admin
- the immediate task is not broad greenfield building
- the immediate task is to reconcile docs (done here) and verify the ingestion
  path end to end so the next phase description is anchored in reality
- runtime gotchas above (port 3001, `AUTH_SECRET`, bootstrap email, schema
  idempotency) are now documented; do not waste a session rediscovering them
