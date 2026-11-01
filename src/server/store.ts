import { promises as fs } from "node:fs";
import path from "node:path";
import SOURCES_JSON from "../lib/sources.json";
import type { NewsData, Settings, SourceDef } from "../lib/types";
import { log } from "./logger";

export const SOURCES = SOURCES_JSON.sources as SourceDef[];

const DATA_DIR = path.join(process.cwd(), "data");
const NEWS_FILE = path.join(DATA_DIR, "news.json");
const SETTINGS_FILE = path.join(DATA_DIR, "settings.json");

export const ALLOWED_INTERVALS = [0, 15, 30, 60, 180, 360, 720];

export const DEFAULT_SETTINGS: Settings = {
  windowHours: 12,
  autoRefreshMinutes: 180,
  maxItems: 240,
  sources: Object.fromEntries(SOURCES.map((s) => [s.id, { enabled: true }])),
};

let newsCache: { data: NewsData; mtimeMs: number } | null = null;
let settingsCache: { settings: Settings; mtimeMs: number } | null = null;

async function atomicWrite(file: string, json: string): Promise<void> {
  const tmp = `${file}.${process.pid}.tmp`;
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(tmp, json, "utf8");
  try {
    await fs.rename(tmp, file);
  } catch (err) {
    // Cleanup temp file on failure
    try {
      await fs.unlink(tmp);
    } catch {
      /* ignore cleanup errors */
    }
    throw err;
  }
}

export async function ensureStore(): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  try {
    await fs.access(SETTINGS_FILE);
  } catch {
    await writeSettings({});
    log.info("created default settings");
  }
}

export async function newsFileMeta(): Promise<{ mtimeMs: number; size: number } | null> {
  const stat = await fs.stat(NEWS_FILE).catch(() => null);
  return stat ? { mtimeMs: stat.mtimeMs, size: stat.size } : null;
}

export async function readNews(): Promise<NewsData | null> {
  const meta = await newsFileMeta();
  if (!meta) return null;
  if (newsCache && newsCache.mtimeMs === meta.mtimeMs) return newsCache.data;
  try {
    const data = JSON.parse(await fs.readFile(NEWS_FILE, "utf8")) as NewsData;
    newsCache = { data, mtimeMs: meta.mtimeMs };
    return data;
  } catch (err) {
    log.error("failed to read news.json:", err);
    newsCache = null;
    return null;
  }
}

export async function writeNews(data: NewsData): Promise<void> {
  await atomicWrite(NEWS_FILE, JSON.stringify(data));
  const meta = await newsFileMeta();
  newsCache = { data, mtimeMs: meta?.mtimeMs ?? Date.now() };
  log.info(`saved ${data.itemCount} stories → ${NEWS_FILE}`);
}

export function normalizeSettings(rawInput: Partial<Settings> | null | undefined): Settings {
  const raw = rawInput ?? {};

  const windowHours = Number.isInteger(raw.windowHours)
    ? Math.min(48, Math.max(1, raw.windowHours as number))
    : DEFAULT_SETTINGS.windowHours;

  const autoRefreshMinutes = ALLOWED_INTERVALS.includes(Number(raw.autoRefreshMinutes))
    ? Number(raw.autoRefreshMinutes)
    : DEFAULT_SETTINGS.autoRefreshMinutes;

  const maxItems = Number.isInteger(raw.maxItems)
    ? Math.min(1000, Math.max(10, raw.maxItems as number))
    : DEFAULT_SETTINGS.maxItems;

  const sources: Settings["sources"] = {};
  for (const s of SOURCES) {
    const enabled = raw.sources?.[s.id]?.enabled;
    sources[s.id] = { enabled: typeof enabled === "boolean" ? enabled : true };
  }

  return { windowHours, autoRefreshMinutes, maxItems, sources };
}

export async function readSettings(): Promise<Settings> {
  const stat = await fs.stat(SETTINGS_FILE).catch(() => null);
  if (stat && settingsCache && settingsCache.mtimeMs === stat.mtimeMs) {
    return settingsCache.settings;
  }
  let file: Partial<Settings> = {};
  if (stat) {
    try {
      file = JSON.parse(await fs.readFile(SETTINGS_FILE, "utf8"));
    } catch {
      log.warn("settings.json is corrupt — falling back to defaults");
    }
  }
  const settings = normalizeSettings(file);
  settingsCache = { settings, mtimeMs: stat?.mtimeMs ?? 0 };
  return settings;
}

export async function writeSettings(patch: Partial<Settings>): Promise<Settings> {
  const current = await readSettings();
  const merged: Partial<Settings> = {
    ...current,
    ...patch,
    sources: patch.sources ? { ...current.sources, ...patch.sources } : current.sources,
  };
  const next = normalizeSettings(merged);
  await atomicWrite(SETTINGS_FILE, JSON.stringify(next, null, 2));
  const stat = await fs.stat(SETTINGS_FILE).catch(() => null);
  settingsCache = { settings: next, mtimeMs: stat?.mtimeMs ?? Date.now() };
  log.info(`settings saved → ${SETTINGS_FILE}`);
  return next;
}

export function enabledSources(settings: Settings): SourceDef[] {
  return SOURCES.filter((s) => settings.sources[s.id]?.enabled !== false);
}

type PatchResult = { ok: true; patch: Partial<Settings> } | { ok: false; error: string };

export function validateSettingsPatch(body: Record<string, unknown>): PatchResult {
  const patch: Partial<Settings> = {};

  if (body.windowHours !== undefined) {
    const v = Number(body.windowHours);
    if (!Number.isInteger(v) || v < 1 || v > 48) {
      return { ok: false, error: "windowHours must be an integer between 1 and 48" };
    }
    patch.windowHours = v;
  }

  if (body.autoRefreshMinutes !== undefined) {
    const v = Number(body.autoRefreshMinutes);
    if (!ALLOWED_INTERVALS.includes(v)) {
      return { ok: false, error: `autoRefreshMinutes must be one of: ${ALLOWED_INTERVALS.join(", ")}` };
    }
    patch.autoRefreshMinutes = v;
  }

  if (body.maxItems !== undefined) {
    const v = Number(body.maxItems);
    if (!Number.isInteger(v) || v < 10 || v > 1000) {
      return { ok: false, error: "maxItems must be an integer between 10 and 1000" };
    }
    patch.maxItems = v;
  }

  if (body.sources !== undefined) {
    if (typeof body.sources !== "object" || body.sources === null || Array.isArray(body.sources)) {
      return { ok: false, error: "sources must be an object keyed by source id" };
    }
    const known = new Set(SOURCES.map((s) => s.id));
    const out: Record<string, { enabled: boolean }> = {};
    for (const [id, value] of Object.entries(body.sources as Record<string, unknown>)) {
      if (!known.has(id)) continue;
      const enabled = (value as { enabled?: unknown } | null)?.enabled;
      if (typeof enabled !== "boolean") {
        return { ok: false, error: `sources.${id}.enabled must be a boolean` };
      }
      out[id] = { enabled };
    }
    patch.sources = out;
  }

  return { ok: true, patch };
}
