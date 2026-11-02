import sourcesJson from "../lib/sources.json";
import type { NewsData, NewsItem, Settings, SourceDef, SourceStatus } from "../lib/types";
import { parseFeed, type ParsedFeedItem } from "./feed-parser";
import { readMobileNews, writeMobileNews } from "./storage";
import { describeError, excerpt, FEED_TIMEOUT_MS, fetchWithTimeout, nowMs, sha1, stripHtml } from "./utils";

const SUMMARY_CHARS = 180;
const MAX_PER_SOURCE = 30;
const CONCURRENCY = 6;
const USER_AGENT = "NewsHub/2.0 (local news digest)";

const registry = sourcesJson.sources as SourceDef[];

export type SourceListener = (status: SourceStatus) => void;

function enabledSources(settings: Settings): SourceDef[] {
  return registry.filter((source) => settings.sources[source.id]?.enabled !== false);
}

async function fetchFeed(url: string): Promise<ParsedFeedItem[]> {
  const response = await fetchWithTimeout(
    url,
    {
      redirect: "follow",
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml, */*",
      },
    },
    FEED_TIMEOUT_MS
  );
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return parseFeed(await response.text());
}

/**
 * Browser port of src/server/newsService.ts. It preserves the server digest
 * shape while replacing rss-parser and filesystem access with browser APIs.
 */
export async function collectMobileNews(settings: Settings, onSource?: SourceListener): Promise<NewsData> {
  const cutoff = Date.now() - settings.windowHours * 3_600_000;
  const sources = enabledSources(settings);
  const existing = await readMobileNews();
  const existingByUrl = new Map<string, NewsItem>();
  for (const item of existing?.items ?? []) existingByUrl.set(item.url, item);

  const items: NewsItem[] = [];
  const seenUrls = new Set<string>();
  const statuses: SourceStatus[] = [];
  const sourceQueue = [...sources];

  async function worker(): Promise<void> {
    while (sourceQueue.length > 0) {
      const source = sourceQueue.shift();
      if (!source) return;

      const startedAt = nowMs();
      let feed: ParsedFeedItem[] | null = null;
      let lastError: string | null = null;
      for (const url of source.feeds) {
        try {
          feed = await fetchFeed(url);
          break;
        } catch (error) {
          lastError = describeError(error);
        }
      }

      const ms = Math.round(nowMs() - startedAt);
      let count = 0;

      if (feed) {
        for (const entry of feed.slice(0, MAX_PER_SOURCE)) {
          const time = Date.parse(entry.isoDate || entry.pubDate || "");
          if (!Number.isFinite(time)) continue;
          const title = stripHtml(entry.title ?? "");
          const url = (entry.link ?? "").trim();
          if (!title || !url || seenUrls.has(url)) continue;
          seenUrls.add(url);

          const summary = excerpt(
            stripHtml(entry.contentSnippet || entry.content || entry.summary || ""),
            SUMMARY_CHARS
          );
          const existingItem = existingByUrl.get(url);
          if (existingItem) {
            if (Date.parse(existingItem.publishedAt) < cutoff) continue;
            items.push({ ...existingItem, title, summary });
            count += 1;
            continue;
          }
          if (time < cutoff) continue;

          items.push({
            id: (await sha1(url)).slice(0, 12),
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
    }
  }

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, Math.max(1, sources.length)) }, () => worker()));

  const filtered = items.filter((item) => Date.parse(item.publishedAt) >= cutoff);
  filtered.sort((left, right) => Date.parse(right.publishedAt) - Date.parse(left.publishedAt));
  statuses.sort((left, right) => left.name.localeCompare(right.name));

  return {
    generatedAt: new Date().toISOString(),
    windowHours: settings.windowHours,
    itemCount: Math.min(filtered.length, settings.maxItems),
    items: filtered.slice(0, settings.maxItems),
    sources: statuses,
  };
}

export async function refreshMobileDigest(settings: Settings, onSource?: SourceListener): Promise<NewsData> {
  const data = await collectMobileNews(settings, onSource);
  await writeMobileNews(data);
  return data;
}
