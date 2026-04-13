import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { searchItemsHybrid, type FeedMode } from "@/lib/search/hybrid-search";

const VALID_MODES: readonly FeedMode[] = ["inbound", "mine", "archive", "all"];
function isMode(x: string | null): x is FeedMode {
  return !!x && (VALID_MODES as readonly string[]).includes(x);
}

/** GET /api/search?q=…&mode=&category=&kind= — hybrid RRF search. */
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q") || "";
  const modeParam = searchParams.get("mode");
  const mode: FeedMode = isMode(modeParam) ? modeParam : "all";
  const categorySlug = searchParams.get("category");
  const kind = searchParams.get("kind");

  if (!q.trim()) return NextResponse.json({ items: [], q });

  try {
    const items = await searchItemsHybrid({
      userId: session.user.id,
      search: q,
      mode,
      categorySlug,
      kind,
    });
    return NextResponse.json({ items, q });
  } catch (err) {
    console.error("[GET /api/search]", err);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
