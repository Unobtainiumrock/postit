import { readFileSync } from "fs";
import { resolve } from "path";

/**
 * Taxonomy loader. Reads `taxonomy/taxonomy.json` at process cwd — resolved
 * lazily + cached so the file is only read once per process. Do not import
 * this module in client bundles (uses fs). All usage is server-side:
 * categorize.ts, seed-taxonomy.ts, admin API routes.
 */

export interface TaxonomyNode {
  slug: string;
  name: string;
  description: string;
  children?: TaxonomyNode[];
}

export interface TaxonomyFile {
  $schema?: string;
  version: number;
  description: string;
  categories: TaxonomyNode[];
}

let cached: TaxonomyFile | null = null;

function load(): TaxonomyFile {
  if (cached) return cached;
  const path = resolve(process.cwd(), "taxonomy", "taxonomy.json");
  cached = JSON.parse(readFileSync(path, "utf-8")) as TaxonomyFile;
  return cached;
}

export function getTaxonomy(): TaxonomyFile {
  return load();
}

/** All *leaf* category slugs. Top-level groups without children count as their own leaf. */
export function getLeafSlugs(): string[] {
  const t = load();
  const out: string[] = [];
  for (const top of t.categories) {
    if (top.children && top.children.length > 0) {
      for (const leaf of top.children) out.push(leaf.slug);
    } else {
      out.push(top.slug);
    }
  }
  return out;
}

/** Leaves with their human-readable name + description for prompting. */
export function getLeafDescriptions(): { slug: string; name: string; description: string }[] {
  const t = load();
  const out: { slug: string; name: string; description: string }[] = [];
  for (const top of t.categories) {
    if (top.children && top.children.length > 0) {
      for (const leaf of top.children) {
        out.push({ slug: leaf.slug, name: leaf.name, description: leaf.description });
      }
    } else {
      out.push({ slug: top.slug, name: top.name, description: top.description });
    }
  }
  return out;
}

/** Every slug, top-level and leaf, for admin tooling / validation. */
export function getAllSlugs(): string[] {
  const t = load();
  const out: string[] = [];
  for (const top of t.categories) {
    out.push(top.slug);
    if (top.children) for (const leaf of top.children) out.push(leaf.slug);
  }
  return out;
}
