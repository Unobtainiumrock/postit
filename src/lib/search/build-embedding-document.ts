/**
 * Builds the deterministic document string we feed to OpenAI for embedding generation.
 * Postit items carry title, description, URL, kind, OG metadata, and assigned categories —
 * all useful signal for semantic search. No transcripts (v1 has no audio uploads).
 */

export interface ItemRowForEmbed {
  title: string | null;
  description: string | null;
  canonicalUrl: string;
  kind: string;
  metadata: Record<string, unknown> | null;
}

function ogDescription(metadata: Record<string, unknown> | null): string {
  if (!metadata || typeof metadata !== "object") return "";
  const og = metadata.og as Record<string, unknown> | undefined;
  const fromOg = og?.description;
  if (typeof fromOg === "string" && fromOg.trim()) return fromOg.trim();
  const direct = metadata.description;
  if (typeof direct === "string" && direct.trim()) return direct.trim();
  return "";
}

export function buildEmbeddingDocument(
  item: ItemRowForEmbed,
  categoryNames: string[]
): string {
  const lines = [
    item.title?.trim() || "",
    item.description?.trim() || "",
    ogDescription(item.metadata),
    item.canonicalUrl?.trim() || "",
    item.kind || "",
    categoryNames.length > 0 ? `Categories: ${categoryNames.sort().join(", ")}` : "",
  ].filter(Boolean);
  return lines.join("\n");
}
