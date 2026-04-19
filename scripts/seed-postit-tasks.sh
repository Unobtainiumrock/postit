#!/usr/bin/env bash
#
# One-shot seed of the postit task queue into a freshly-installed local
# Priority Forge instance. Designed for the cold-clone handoff documented in
# `docs/CURRENT_STATUS.md` → "Priority Forge install + task reconstruction".
#
# Idempotency: this script DELETES ITSELF on success. After it runs, commit the
# deletion (`git add scripts/seed-postit-tasks.sh && git commit -m "..."`).
# If you ever need to re-seed, restore from git history with
# `git checkout HEAD~ -- scripts/seed-postit-tasks.sh` and run again.
#
# Preconditions:
#   - Priority Forge installed and backend running on http://127.0.0.1:3456
#   - (Install via `git clone https://github.com/Unobtainiumrock/priority-forge`,
#     `npm install`, `bash setup.sh` in that repo.)

set -euo pipefail

PF=http://127.0.0.1:3456
HEALTH=$(curl -s -m 3 "$PF/health" || true)
if [[ -z "$HEALTH" ]] || [[ "$HEALTH" != *"\"status\":\"ok\""* ]]; then
  echo "ERROR: Priority Forge backend not reachable at $PF" >&2
  echo "Install Priority Forge first; see docs/CURRENT_STATUS.md → 'Priority Forge install + task reconstruction'." >&2
  exit 1
fi

echo "→ Seeding postit tasks into Priority Forge at $PF ..."

# 1) Umbrella — P1, in_progress, high effort
curl -fsS -X POST "$PF/tasks" -H 'Content-Type: application/json' --data @- <<'JSON' >/dev/null
{
  "task": "Build postit v1 — fork sharedboard, link-only PWA with merge-attribute dedup, fixed taxonomy, asymmetric feed",
  "priority": "P1",
  "project": "postit",
  "status": "in_progress",
  "effort": "high",
  "notes": "Umbrella task for the postit v1 build. Phase rollup:\n  - POSTIT-P1: Scaffold foundation (complete)\n  - POSTIT-P2: Library + core code (complete in code; doc reconciled in docs/CURRENT_STATUS.md)\n  - POSTIT-P3: API route handlers (complete in code; verification still active under task #2 below)\n  - POSTIT-P4: Feed UI + Liquid Glass (complete in code; surface review still owed)\n  - POSTIT-P5: Admin console (complete in code; polish owed)\n  - POSTIT-P6: Polish + AWS deploy (not started)\n\nPlan-of-record: docs/CURRENT_STATUS.md in the postit repo.\n\nStack: fork of sharedboard — Next.js 16 App Router + NextAuth v5 (Cognito prod / dev-credentials local) + pg pool + pgvector + OpenAI (gpt-4o-mini classification, text-embedding-3-small embeddings) + next-pwa.\n\nKey postit changes vs sharedboard: single global space (no boards table), rename posts→items, item_posters for merge-attribute dedup with ≤280-char chat-proof note, canonical_id + url_hash dedup, LLM constrained to taxonomy.json leaf slugs via JSON-schema enum, invite-link first-signup gate, asymmetric feed (inbound/mine/archive), fully visible consumed badges, Liquid Glass CSS. Link-only v1 (YouTube/Spotify/Apple Podcasts/URL)."
}
JSON
echo "  ✓ umbrella task created"

# 2) Active spine of work — P1, in_progress, medium
curl -fsS -X POST "$PF/tasks" -H 'Content-Type: application/json' --data @- <<'JSON' >/dev/null
{
  "task": "Audit and finish postit item ingestion path across auth, dedup, API routes, and background enrichment",
  "priority": "P1",
  "project": "postit",
  "status": "in_progress",
  "effort": "medium",
  "notes": "Verify auth gate, canonical URL normalization, dedup semantics, item creation, background categorization, and any missing route/lib glue. Implement missing pieces and verify behavior. Drive this to done before opening new feature work — see docs/CURRENT_STATUS.md → 'Practical interpretation of the queue'."
}
JSON
echo "  ✓ ingestion-audit task created"

# 3) Environment-only — P2, not_started, low (loosely tagged to postit)
curl -fsS -X POST "$PF/tasks" -H 'Content-Type: application/json' --data @- <<'JSON' >/dev/null
{
  "task": "Verify Codex sandbox/userns fix after AppArmor sysctl override",
  "priority": "P2",
  "project": "postit",
  "status": "not_started",
  "effort": "low",
  "notes": "kernel.apparmor_restrict_unprivileged_userns=0 was applied live and persisted at /etc/sysctl.d/99-codex-userns.conf. Need to verify the previously failing sandbox/isolation checks now pass. Tagged to postit only because it surfaced during a postit working session — does not block product work."
}
JSON
echo "  ✓ Codex userns environment task created"

echo
echo "→ Verifying:"
COUNT=$(curl -s "$PF/tasks" | python3 -c 'import json,sys; print(sum(1 for t in json.load(sys.stdin) if t.get("project")=="postit"))')
echo "  $COUNT postit-tagged task(s) in Priority Forge."
echo

# Self-delete: this script is one-shot. Commit the deletion.
SCRIPT="$0"
echo "→ Removing one-shot script: $SCRIPT"
rm -- "$SCRIPT"
echo
echo "Done. Now:"
echo "  git add $(basename "$SCRIPT" | xargs -I {} echo scripts/{})"
echo "  git commit -m 'Remove one-shot seed script after first-time setup'"
echo "  # then resume work on the active P1 ingestion-audit task per docs/CURRENT_STATUS.md"
