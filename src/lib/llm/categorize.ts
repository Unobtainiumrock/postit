import OpenAI from "openai";
import { getLeafSlugs, getLeafDescriptions } from "@/lib/taxonomy/load";

/**
 * Classifies an item against the FIXED taxonomy (taxonomy/taxonomy.json). The LLM
 * is constrained via OpenAI structured outputs (response_format: json_schema, strict)
 * with `categories[]` items declared as a string `enum` of leaf slugs. The model
 * therefore CANNOT invent new categories — this is the whole point of the rewrite
 * vs. sharedboard, which allowed free-form category creation and risked cardinality
 * explosion.
 *
 * To change the taxonomy, edit taxonomy/taxonomy.json and re-run `npm run taxonomy:seed`.
 */

function getOpenAI() {
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

export interface CategorizeInput {
  title: string | null;
  description: string | null;
  canonicalUrl: string;
  kind: string;
}

export interface CategorizeResult {
  /** 1..3 slugs guaranteed to be a subset of getLeafSlugs() */
  categorySlugs: string[];
  /** Single-sentence description of what the resource is, ≤160 chars */
  summary: string | null;
  /** Self-rated confidence 0..1 (used by admin to flag low-confidence items for review) */
  confidence: number;
}

const SYSTEM_PROMPT_HEADER = `You classify content posted to a shared curated board. Choose 1–3 leaf category slugs from the fixed taxonomy below. Pick the most specific leaves that apply. If nothing fits well, still pick the closest leaf(s) and lower your confidence accordingly.

The summary should be ONE concise sentence describing what the resource IS about — neutral, informative, not a pitch. Maximum 160 characters.

Taxonomy (you may only return slugs from this list):`;

export async function categorizeItem(input: CategorizeInput): Promise<CategorizeResult> {
  const slugs = getLeafSlugs();
  const leafDescs = getLeafDescriptions();
  const taxonomyDoc = leafDescs
    .map((l) => `- ${l.slug} — ${l.name}: ${l.description}`)
    .join("\n");

  const userBlock = [
    input.title && `Title: ${input.title}`,
    input.description && `Description: ${input.description.slice(0, 600)}`,
    `URL: ${input.canonicalUrl}`,
    `Kind: ${input.kind}`,
  ]
    .filter(Boolean)
    .join("\n");

  const response = await getOpenAI().chat.completions.create({
    model: "gpt-4o-mini",
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "item_labels",
        strict: true,
        schema: {
          type: "object",
          additionalProperties: false,
          required: ["categories", "summary", "confidence"],
          properties: {
            categories: {
              type: "array",
              minItems: 1,
              maxItems: 3,
              items: { type: "string", enum: slugs },
            },
            summary: { type: "string", maxLength: 160 },
            confidence: { type: "number", minimum: 0, maximum: 1 },
          },
        },
      },
    },
    messages: [
      { role: "system", content: `${SYSTEM_PROMPT_HEADER}\n${taxonomyDoc}` },
      { role: "user", content: userBlock },
    ],
  });

  const raw = response.choices[0].message.content || "{}";
  const parsed = JSON.parse(raw) as {
    categories: string[];
    summary: string;
    confidence: number;
  };

  // Defensive filter: if the model somehow returned a slug not in the enum (shouldn't
  // happen with strict mode, but belt-and-suspenders).
  const slugSet = new Set(slugs);
  const categorySlugs = (parsed.categories ?? []).filter((s) => slugSet.has(s));

  return {
    categorySlugs,
    summary: parsed.summary ?? null,
    confidence: typeof parsed.confidence === "number" ? parsed.confidence : 0.5,
  };
}
