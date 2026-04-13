export interface OGMetadata {
  title: string | null;
  description: string | null;
  image: string | null;
  siteName: string | null;
  type: string | null;
}

/**
 * Fetches a URL and extracts Open Graph metadata via regex.
 * 5s timeout; returns all-null on any failure so callers can continue without blocking.
 */
export async function fetchOGMetadata(url: string): Promise<OGMetadata> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Postit/1.0 (+https://github.com/unobtainium/postit)" },
      signal: AbortSignal.timeout(5000),
    });
    const html = await res.text();

    const getMetaContent = (property: string): string | null => {
      const match =
        html.match(
          new RegExp(
            `<meta[^>]*(?:property|name)=["']${property}["'][^>]*content=["']([^"']*)["']`,
            "i"
          )
        ) ||
        html.match(
          new RegExp(
            `<meta[^>]*content=["']([^"']*)["'][^>]*(?:property|name)=["']${property}["']`,
            "i"
          )
        );
      return match?.[1] || null;
    };

    const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);

    return {
      title: getMetaContent("og:title") || titleMatch?.[1]?.trim() || null,
      description:
        getMetaContent("og:description") || getMetaContent("description"),
      image: getMetaContent("og:image"),
      siteName: getMetaContent("og:site_name"),
      type: getMetaContent("og:type"),
    };
  } catch {
    return { title: null, description: null, image: null, siteName: null, type: null };
  }
}
