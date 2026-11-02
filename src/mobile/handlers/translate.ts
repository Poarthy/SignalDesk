import type { MobileRequest } from "../request";
import { jsonResponse } from "../request";
import { readTranslationEntries, writeTranslationEntries } from "../storage";
import { fetchWithTimeout, sha1, TRANSLATION_TIMEOUT_MS } from "../utils";

const MAX_TEXTS = 5;
const MAX_CHARS_PER_TEXT = 1200;
const CACHE_LIMIT = 600;
const MYMEMORY_MAX_BYTES = 450;
const USER_AGENT = "NewsHub/2.1 (local news digest)";

let preferredProviderIndex = 0;

function decodeCodePoint(code: number): string {
  return Number.isInteger(code) && code >= 0 && code <= 0x10ffff ? String.fromCodePoint(code) : "";
}

function decodeEntities(value: string): string {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_, number: string) => decodeCodePoint(parseInt(number, 16)))
    .replace(/&#(\d+);/g, (_, number: string) => decodeCodePoint(Number(number)))
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
  const response = await fetchWithTimeout(url, { headers: { "User-Agent": USER_AGENT } }, TRANSLATION_TIMEOUT_MS);
  if (!response.ok) throw new Error(`google HTTP ${response.status}`);

  const data = (await response.json()) as unknown;
  if (!Array.isArray(data) || !Array.isArray(data[0])) throw new Error("google: unexpected response");
  let output = "";
  for (const segment of data[0] as unknown[]) {
    if (Array.isArray(segment) && typeof segment[0] === "string") output += segment[0];
  }
  output = output.trim();
  if (!output) throw new Error("google: empty translation");
  return output;
}

function splitForMyMemory(text: string): string[] {
  if (new TextEncoder().encode(text).byteLength <= MYMEMORY_MAX_BYTES) return [text];
  const chunks: string[] = [];
  let current = "";
  for (const word of text.split(/\s+/)) {
    const candidate = current ? `${current} ${word}` : word;
    if (current && new TextEncoder().encode(candidate).byteLength > MYMEMORY_MAX_BYTES) {
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
    const response = await fetchWithTimeout(url, { headers: { "User-Agent": USER_AGENT } }, TRANSLATION_TIMEOUT_MS);
    if (!response.ok) throw new Error(`mymemory HTTP ${response.status}`);
    const data = (await response.json()) as {
      responseData?: { translatedText?: unknown };
      responseStatus?: unknown;
    };
    const status = Number(data.responseStatus ?? 0);
    const output = typeof data.responseData?.translatedText === "string" ? data.responseData.translatedText.trim() : "";
    if ((status !== 0 && status !== 200) || !output || /^MYMEMORY WARNING/i.test(output)) {
      throw new Error("mymemory: request rejected");
    }
    parts.push(decodeEntities(output));
  }
  return parts.join(" ");
}

type Provider = (text: string) => Promise<string>;

const providers: Array<{ name: string; run: Provider }> = [
  { name: "google", run: translateViaGoogle },
  { name: "mymemory", run: translateViaMyMemory },
];

async function cacheGet(key: string): Promise<string | undefined> {
  const entries = await readTranslationEntries();
  const hit = entries.find((entry) => entry.key === key);
  if (!hit) return undefined;
  hit.usedAt = Date.now();
  await writeTranslationEntries(entries);
  return hit.value;
}

async function cacheSet(key: string, value: string): Promise<void> {
  const entries = (await readTranslationEntries()).filter((entry) => entry.key !== key);
  entries.push({ key, value, usedAt: Date.now() });
  entries.sort((left, right) => left.usedAt - right.usedAt);
  await writeTranslationEntries(entries.slice(-CACHE_LIMIT));
}

async function translateToPersian(text: string): Promise<string> {
  const key = await sha1(text);
  const cached = await cacheGet(key);
  if (cached !== undefined) return cached;

  let lastError: Error | null = null;
  for (let attempt = 0; attempt < providers.length; attempt += 1) {
    const index = (preferredProviderIndex + attempt) % providers.length;
    try {
      const output = await providers[index].run(text);
      preferredProviderIndex = index;
      await cacheSet(key, output);
      return output;
    } catch (error) {
      lastError = error instanceof Error ? error : null;
    }
  }
  throw new Error(lastError?.message ? `upstream unreachable (${lastError.message})` : "upstream unreachable");
}

export async function handleMobileTranslate(request: MobileRequest): Promise<Response> {
  if (request.method !== "POST") return jsonResponse({ error: `Method ${request.method} not allowed` }, { status: 405, headers: { allow: "POST" } });
  const body = (await request.json().catch(() => null)) as { texts?: unknown } | null;
  const texts = body?.texts;
  if (!Array.isArray(texts) || texts.length === 0 || texts.length > MAX_TEXTS) {
    return jsonResponse({ error: `texts must be an array of 1-${MAX_TEXTS} strings` }, { status: 400 });
  }
  for (const text of texts) {
    if (typeof text !== "string") return jsonResponse({ error: "texts must contain only strings" }, { status: 400 });
    if (text.length > MAX_CHARS_PER_TEXT) {
      return jsonResponse({ error: `each text must be at most ${MAX_CHARS_PER_TEXT} characters` }, { status: 400 });
    }
  }

  try {
    const translations = await Promise.all((texts as string[]).map(translateToPersian));
    return jsonResponse({ translations }, { headers: { "cache-control": "no-store" } });
  } catch {
    return jsonResponse(
      { error: "Translation service is unreachable right now. Please try again later." },
      { status: 502 }
    );
  }
}
