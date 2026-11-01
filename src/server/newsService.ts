import Parser from "rss-parser";
import { createHash } from "node:crypto";
import type { NewsData, NewsItem, Settings, SourceStatus } from "../lib/types";
import { enabledSources, readNews } from "./store";
import { log } from "./logger";

const TIMEOUT_MS = 15_000;
const SUMMARY_CHARS = 180;
const MAX_PER_SOURCE = 30;
const CONCURRENCY = 6;
const USER_AGENT = "NewsHub/2.0 (local news digest)";

const parser = new Parser();

/** Walks the error cause chain so "fetch failed" becomes actionable. */
function describeFetchError(err: unknown): string {
  const parts: string[] = [];
  let current: unknown = err;
  for (let depth = 0; current && depth < 6; depth++) {
    if (current instanceof Error) {
      if (current.message && !parts.includes(current.message)) parts.push(current.message);
      current = (current as { cause?: unknown }).cause;
    } else if (typeof current === "string") {
      if (current && !parts.includes(current)) parts.push(current);
      break;
    } else {
      break;
    }
  }
  return parts.join(" → ") || "unknown error";
}

function decodeCodePoint(code: number): string {
  return Number.isInteger(code) && code >= 0 && code <= 0x10ffff ? String.fromCodePoint(code) : "";
}

function stripHtml(value = ""): string {
  return value
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<!\[CDATA\[|\]\]>/g, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => decodeCodePoint(parseInt(n, 16)))
    .replace(/&#(\d+);/g, (_, n) => decodeCodePoint(Number(n)))
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&zwnj;/gi, "\u200c")
    .replace(/\s+/g, " ")
    .trim();
}

function excerpt(text: string): string {
  return text.length > SUMMARY_CHARS ? `${text.slice(0, SUMMARY_CHARS - 1).trimEnd()}…` : text;
}

async function fetchFeed(url: string): Promise<Parser.Output<any>> {
  const res = await fetch(url, {
    redirect: "follow",
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml, */*",
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return parser.parseString(await res.text());
}

export type SourceListener = (status: SourceStatus) => void;

/**
 * The single sync engine (build-time and runtime). Fetches every enabled feed
 * directly over the network and rebuilds the digest.
 */
export async function collectNews(settings: Settings, onSource?: SourceListener): Promise<NewsData> {
  const cutoff = Date.now() - settings.windowHours * 3_600_000;
  const sources = enabledSources(settings);

  // Merge with previous data so updated articles / live blogs keep their
  // original timestamp.
  const existing = await readNews();
  const existingByUrl = new Map<string, NewsItem>();
  if (existing) {
    for (const item of existing.items) existingByUrl.set(item.url, item);
  }

  const items: NewsItem[] = [];
  const seenUrls = new Set<string>();
  const statuses: SourceStatus[] = [];
  
  // FIX: Use a queue instead of shared cursor to prevent race conditions
  const sourceQueue = [...sources];

  async function worker(): Promise<void> {
    while (sourceQueue.length > 0) {
      const source = sourceQueue.shift();
      if (!source) break;
      
      const startedAt = performance.now();

      let feed: Parser.Output<any> | null = null;
      let lastError: string | null = null;
      for (const url of source.feeds) {
        try {
          feed = await fetchFeed(url);
          break;
        } catch (err) {
          lastError = describeFetchError(err);
        }
      }

      const ms = Math.round(performance.now() - startedAt);
      let count = 0;

      if (feed) {
        for (const entry of (feed.items ?? []).slice(0, MAX_PER_SOURCE)) {
          const time = Date.parse(entry.isoDate || entry.pubDate || "");
          if (!Number.isFinite(time)) continue;
          const title = stripHtml(entry.title ?? "");
          const url = (entry.link ?? "").trim();
          if (!title || !url) continue;

          const summary = excerpt(stripHtml(entry.contentSnippet || entry.content || entry.summary || entry.description || ""));

          if (seenUrls.has(url)) continue;
          seenUrls.add(url);

          const existingItem = existingByUrl.get(url);
          if (existingItem) {
            // Keep the original timestamp, but only if it is still inside the
            // current window — otherwise the item would be dropped by the
            // final filter below while still inflating this source's count.
            if (Date.parse(existingItem.publishedAt) < cutoff) continue;
            items.push({ ...existingItem, title, summary });
            count += 1;
            continue;
          }

          if (time < cutoff) continue;

          const id = createHash("sha1").update(url).digest("hex").slice(0, 12);
          items.push({
            id,
            title,
            summary,
            url,
            publishedAt: new Date(time).toISOString(),
            sourceId: source.id,
            sourceName: source.name,
            country: source.country,
            flag: source.flag,
            region: source.region,
            lang: source.lang,
          });
          count += 1;
        }
      }

      const status: SourceStatus = {
        id: source.id,
        name: source.name,
        country: source.country,
        flag: source.flag,
        region: source.region,
        type: source.type,
        ok: Boolean(feed),
        count,
        ms,
        ...(feed ? {} : { error: lastError ?? "unreachable" }),
      };
      statuses.push(status);
      onSource?.(status);
      log.info(`${status.ok ? "✓" : "✗"} ${source.name.padEnd(22)} ${String(count).padStart(3)} items · ${ms}ms${status.ok ? "" : ` · ${lastError}`}`);
    }
  }

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, Math.max(1, sources.length)) }, () => worker()));

  const filtered = items.filter((item) => Date.parse(item.publishedAt) >= cutoff);
  filtered.sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt));
  statuses.sort((a, b) => a.name.localeCompare(b.name));

  return {
    generatedAt: new Date().toISOString(),
    windowHours: settings.windowHours,
    itemCount: Math.min(filtered.length, settings.maxItems),
    items: filtered.slice(0, settings.maxItems),
    sources: statuses,
  };
}
