import { NextRequest } from "next/server";
import { createHash } from "node:crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_TEXTS = 5;
const MAX_CHARS_PER_TEXT = 1200;
const TIMEOUT_MS = 10_000;
const CACHE_LIMIT = 600;
const USER_AGENT = "NewsHub/2.1 (local news digest)";
const MYMEMORY_MAX_BYTES = 450;

/** sha1(text) -> Persian translation. Re-inserted on hit for LRU behavior. */
const cache = new Map<string, string>();

function cacheGet(key: string): string | undefined {
  const hit = cache.get(key);
  if (hit !== undefined) {
    cache.delete(key);
    cache.set(key, hit);
  }
  return hit;
}

function cacheSet(key: string, value: string): void {
  cache.delete(key);
  cache.set(key, value);
  if (cache.size > CACHE_LIMIT) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
}

function decodeCodePoint(code: number): string {
  return Number.isInteger(code) && code >= 0 && code <= 0x10ffff ? String.fromCodePoint(code) : "";
}

function decodeEntities(value: string): string {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => decodeCodePoint(parseInt(n, 16)))
    .replace(/&#(\d+);/g, (_, n) => decodeCodePoint(Number(n)))
    .replace(/&quot;/gi, '"')
    .replace(/&apos;/gi, "'")
    .replace(/&nbsp;/gi, " ")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&amp;/gi, "&");
}

async function translateViaGoogle(text: string): Promise<string> {
  const url = new URL("https://translate.googleapis.com/translate_a/single");
  url.searchParams.set("client", "gtx");
  url.searchParams.set("sl", "en");
  url.searchParams.set("tl", "fa");
  url.searchParams.set("dt", "t");
  url.searchParams.set("q", text);

  const res = await fetch(url, {
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: { "User-Agent": USER_AGENT },
  });
  if (!res.ok) throw new Error(`google HTTP ${res.status}`);

  // dt=t returns [[[translated, original, ...], ...], ...]
  const data = (await res.json()) as unknown;
  if (!Array.isArray(data) || !Array.isArray(data[0])) throw new Error("google: unexpected response");
  let out = "";
  for (const seg of data[0] as unknown[]) {
    if (Array.isArray(seg) && typeof seg[0] === "string") out += seg[0];
  }
  out = out.trim();
  if (!out) throw new Error("google: empty translation");
  return out;
}

function splitForMyMemory(text: string): string[] {
  if (Buffer.byteLength(text, "utf8") <= MYMEMORY_MAX_BYTES) return [text];
  const chunks: string[] = [];
  let current = "";
  for (const word of text.split(/\s+/)) {
    const candidate = current ? `${current} ${word}` : word;
    if (current && Buffer.byteLength(candidate, "utf8") > MYMEMORY_MAX_BYTES) {
      chunks.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

async function translateViaMyMemory(text: string): Promise<string> {
  const parts: string[] = [];
  for (const chunk of splitForMyMemory(text)) {
    const url = new URL("https://api.mymemory.translated.net/get");
    url.searchParams.set("q", chunk);
    url.searchParams.set("langpair", "en|fa");

    const res = await fetch(url, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { "User-Agent": USER_AGENT },
    });
    if (!res.ok) throw new Error(`mymemory HTTP ${res.status}`);

    const data = (await res.json()) as {
      responseData?: { translatedText?: unknown };
      responseStatus?: unknown;
    };
    const status = Number(data.responseStatus ?? 0);
    const out =
      typeof data.responseData?.translatedText === "string"
        ? data.responseData.translatedText.trim()
        : "";
    if ((status !== 0 && status !== 200) || !out || /^MYMEMORY WARNING/i.test(out)) {
      throw new Error(`mymemory: request rejected`);
    }
    parts.push(decodeEntities(out));
  }
  return parts.join(" ");
}

type Provider = (text: string) => Promise<string>;
const PROVIDERS: Array<{ name: string; fn: Provider }> = [
  { name: "google", fn: translateViaGoogle },
  { name: "mymemory", fn: translateViaMyMemory },
];

// Remember the provider that last worked so healthy setups skip the failing one.
let preferredIndex = 0;

async function translateToPersian(text: string): Promise<string> {
  const key = createHash("sha1").update(text).digest("hex");
  const hit = cacheGet(key);
  if (hit !== undefined) return hit;

  let lastError: Error | null = null;
  for (let attempt = 0; attempt < PROVIDERS.length; attempt++) {
    const index = (preferredIndex + attempt) % PROVIDERS.length;
    try {
      const out = await PROVIDERS[index].fn(text);
      preferredIndex = index;
      cacheSet(key, out);
      return out;
    } catch (err) {
      lastError = err instanceof Error ? err : null;
    }
  }
  throw new Error(lastError?.message ? `upstream unreachable (${lastError.message})` : "upstream unreachable");
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as { texts?: unknown } | null;
  const texts = body?.texts;
  if (!Array.isArray(texts) || texts.length === 0 || texts.length > MAX_TEXTS) {
    return Response.json({ error: `texts must be an array of 1-${MAX_TEXTS} strings` }, { status: 400 });
  }
  for (const t of texts) {
    if (typeof t !== "string") {
      return Response.json({ error: "texts must contain only strings" }, { status: 400 });
    }
    if (t.length > MAX_CHARS_PER_TEXT) {
      return Response.json({ error: `each text must be at most ${MAX_CHARS_PER_TEXT} characters` }, { status: 400 });
    }
  }

  try {
    const translations = await Promise.all((texts as string[]).map(translateToPersian));
    return Response.json({ translations }, { headers: { "cache-control": "no-store" } });
  } catch {
    return Response.json(
      { error: "Translation service is unreachable right now — please try again later." },
      { status: 502 }
    );
  }
}
