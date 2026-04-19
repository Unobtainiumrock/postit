import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { postItem, InvalidUrlError } from "@/lib/items/post";
import { runItemCategorization } from "@/lib/jobs/run-item-categorization";
import { feedItems, type FeedMode } from "@/lib/search/hybrid-search";

const VALID_MODES: readonly FeedMode[] = ["inbound", "mine", "archive", "all"];

function isMode(x: string | null): x is FeedMode {
  return !!x && (VALID_MODES as readonly string[]).includes(x);
}

/** POST /api/items — create or attribute to an existing item (merge-attribute dedup). */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const url = typeof body?.url === "string" ? body.url : null;
  const note = typeof body?.note === "string" ? body.note : null;
  if (!url) {
    return NextResponse.json({ error: "url required" }, { status: 400 });
  }

  try {
    const result = await postItem({ url, note, userId: session.user.id });

    // Kick categorization in-process on brand-new items. Don't await — response
    // returns 202 immediately; the worker flips status='ready' on completion and
    // the client's next feed poll picks it up.
    if (!result.deduped) {
      runItemCategorization(result.itemId).catch((e) =>
        console.error("[POST /api/items] bg categorization failed:", e)
      );
    }

    return NextResponse.json(
      { id: result.itemId, deduped: result.deduped },
      { status: result.deduped ? 200 : 202 }
    );
  } catch (err) {
    if (err instanceof InvalidUrlError) {
      return NextResponse.json({ error: "invalid url" }, { status: 400 });
    }
    console.error("[POST /api/items]", err);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}

/** GET /api/items?mode=inbound|mine|archive|all — paged feed. */
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const modeParam = searchParams.get("mode");
  const mode: FeedMode = isMode(modeParam) ? modeParam : "inbound";
  const categorySlug = searchParams.get("category");
  const kind = searchParams.get("kind");
  const before = searchParams.get("before");
  // Default to 40. `Number(null)` is 0 (finite), so parse the raw string
  // first and only accept positive numbers — a missing `?limit=` must fall
  // through to the default, not collapse to LIMIT 1.
  const limitRaw = searchParams.get("limit");
  const parsedLimit = limitRaw != null ? Number(limitRaw) : NaN;
  const limit =
    Number.isFinite(parsedLimit) && parsedLimit > 0
      ? Math.min(100, Math.floor(parsedLimit))
      : 40;

  try {
    const items = await feedItems({
      userId: session.user.id,
      mode,
      categorySlug,
      kind,
      before,
      limit,
    });
    return NextResponse.json({ items, mode });
  } catch (err) {
    console.error("[GET /api/items]", err);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
