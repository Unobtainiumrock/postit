import OpenAI from "openai";

const MODEL = "text-embedding-3-small"; // 1536 dims
const MAX_INPUT_CHARS = 8000;

export async function embedText(text: string): Promise<number[] | null> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return null;

  const trimmed = text.trim().slice(0, MAX_INPUT_CHARS);
  if (!trimmed) return null;

  const openai = new OpenAI({ apiKey: key });
  const res = await openai.embeddings.create({
    model: MODEL,
    input: trimmed,
  });
  return res.data[0]?.embedding ?? null;
}

/** Render a JS number[] embedding as the text form pgvector accepts: "[0.1,0.2,...]". */
export function vectorToPgLiteral(embedding: number[]): string {
  return `[${embedding.join(",")}]`;
}
