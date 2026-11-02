import settingsDefaults from "../../data/settings.json";
import sourcesJson from "../lib/sources.json";
import type { NewsData, Settings, SourceDef } from "../lib/types";

const DATABASE_NAME = "signaldesk-mobile";
const DATABASE_VERSION = 1;
const SETTINGS_KEY = "signaldesk.mobile.settings";
const DIGEST_STORE = "digest";
const TRANSLATION_STORE = "translations";
const RECORD_KEY = "current";
const TRANSLATION_RECORD_KEY = "entries";

const registry = sourcesJson.sources as SourceDef[];
const memory = new Map<string, unknown>();
let memorySettings: Settings | null = null;

export interface TranslationCacheEntry {
  key: string;
  value: string;
  usedAt: number;
}

function cloneSettings(settings: Settings): Settings {
  return {
    windowHours: settings.windowHours,
    autoRefreshMinutes: settings.autoRefreshMinutes,
    maxItems: settings.maxItems,
    sources: Object.fromEntries(Object.entries(settings.sources).map(([id, value]) => [id, { enabled: value.enabled }])),
  };
}

export function mobileDefaultSettings(): Settings {
  const defaults = settingsDefaults as Settings;
  return {
    windowHours: defaults.windowHours,
    autoRefreshMinutes: defaults.autoRefreshMinutes,
    maxItems: defaults.maxItems,
    sources: Object.fromEntries(
      registry.map((source) => [source.id, { enabled: defaults.sources[source.id]?.enabled ?? true }])
    ),
  };
}

export const ALLOWED_INTERVALS = [0, 15, 30, 60, 180, 360, 720];

export function normalizeMobileSettings(rawInput: Partial<Settings> | null | undefined): Settings {
  const raw = rawInput ?? {};
  const defaults = mobileDefaultSettings();
  const windowHours = Number.isInteger(raw.windowHours)
    ? Math.min(48, Math.max(1, raw.windowHours as number))
    : defaults.windowHours;
  const autoRefreshMinutes = ALLOWED_INTERVALS.includes(Number(raw.autoRefreshMinutes))
    ? Number(raw.autoRefreshMinutes)
    : defaults.autoRefreshMinutes;
  const maxItems = Number.isInteger(raw.maxItems)
    ? Math.min(1000, Math.max(10, raw.maxItems as number))
    : defaults.maxItems;
  const sources: Settings["sources"] = {};

  for (const source of registry) {
    const enabled = raw.sources?.[source.id]?.enabled;
    sources[source.id] = {
      enabled: typeof enabled === "boolean" ? enabled : defaults.sources[source.id]?.enabled ?? true,
    };
  }

  return { windowHours, autoRefreshMinutes, maxItems, sources };
}

type PatchResult = { ok: true; patch: Partial<Settings> } | { ok: false; error: string };

export function validateMobileSettingsPatch(body: Record<string, unknown>): PatchResult {
  const patch: Partial<Settings> = {};

  if (body.windowHours !== undefined) {
    const value = Number(body.windowHours);
    if (!Number.isInteger(value) || value < 1 || value > 48) {
      return { ok: false, error: "windowHours must be an integer between 1 and 48" };
    }
    patch.windowHours = value;
  }

  if (body.autoRefreshMinutes !== undefined) {
    const value = Number(body.autoRefreshMinutes);
    if (!ALLOWED_INTERVALS.includes(value)) {
      return { ok: false, error: `autoRefreshMinutes must be one of: ${ALLOWED_INTERVALS.join(", ")}` };
    }
    patch.autoRefreshMinutes = value;
  }

  if (body.maxItems !== undefined) {
    const value = Number(body.maxItems);
    if (!Number.isInteger(value) || value < 10 || value > 1000) {
      return { ok: false, error: "maxItems must be an integer between 10 and 1000" };
    }
    patch.maxItems = value;
  }

  if (body.sources !== undefined) {
    if (typeof body.sources !== "object" || body.sources === null || Array.isArray(body.sources)) {
      return { ok: false, error: "sources must be an object keyed by source id" };
    }
    const known = new Set(registry.map((source) => source.id));
    const sources: Record<string, { enabled: boolean }> = {};
    for (const [id, value] of Object.entries(body.sources as Record<string, unknown>)) {
      if (!known.has(id)) continue;
      const enabled = (value as { enabled?: unknown } | null)?.enabled;
      if (typeof enabled !== "boolean") {
        return { ok: false, error: `sources.${id}.enabled must be a boolean` };
      }
      sources[id] = { enabled };
    }
    patch.sources = sources;
  }

  return { ok: true, patch };
}

function memoryKey(store: string, key: string): string {
  return `${store}:${key}`;
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB is unavailable"));
      return;
    }
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onerror = () => reject(request.error ?? new Error("Unable to open IndexedDB"));
    request.onupgradeneeded = () => {
      const database = request.result;
      for (const store of [DIGEST_STORE, TRANSLATION_STORE]) {
        if (!database.objectStoreNames.contains(store)) database.createObjectStore(store);
      }
    };
    request.onsuccess = () => resolve(request.result);
  });
}

async function readRecord<T>(store: string, key: string): Promise<T | null> {
  const fallback = memory.get(memoryKey(store, key)) as T | undefined;
  try {
    const database = await openDatabase();
    const value = await new Promise<T | undefined>((resolve, reject) => {
      const transaction = database.transaction(store, "readonly");
      const request = transaction.objectStore(store).get(key);
      request.onerror = () => reject(request.error ?? new Error("IndexedDB read failed"));
      request.onsuccess = () => resolve(request.result as T | undefined);
    });
    database.close();
    return value ?? fallback ?? null;
  } catch {
    return fallback ?? null;
  }
}

async function writeRecord<T>(store: string, key: string, value: T): Promise<void> {
  memory.set(memoryKey(store, key), value);
  try {
    const database = await openDatabase();
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(store, "readwrite");
      transaction.onerror = () => reject(transaction.error ?? new Error("IndexedDB write failed"));
      transaction.oncomplete = () => resolve();
      transaction.objectStore(store).put(value, key);
    });
    database.close();
  } catch {
    // The in-memory copy keeps the current session usable if storage is unavailable.
  }
}

export async function readMobileSettings(): Promise<Settings> {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    const settings = normalizeMobileSettings(raw ? (JSON.parse(raw) as Partial<Settings>) : null);
    memorySettings = cloneSettings(settings);
    return settings;
  } catch {
    return memorySettings ? cloneSettings(memorySettings) : mobileDefaultSettings();
  }
}

export async function writeMobileSettings(patch: Partial<Settings>): Promise<Settings> {
  const current = await readMobileSettings();
  const next = normalizeMobileSettings({
    ...current,
    ...patch,
    sources: patch.sources ? { ...current.sources, ...patch.sources } : current.sources,
  });
  memorySettings = cloneSettings(next);
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
  } catch {
    // The in-memory settings copy is used when localStorage is blocked or full.
  }
  return cloneSettings(next);
}

function isNewsData(value: unknown): value is NewsData {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<NewsData>;
  return typeof candidate.generatedAt === "string" && Array.isArray(candidate.items) && Array.isArray(candidate.sources);
}

export async function readMobileNews(): Promise<NewsData | null> {
  const value = await readRecord<unknown>(DIGEST_STORE, RECORD_KEY);
  return isNewsData(value) ? value : null;
}

export async function writeMobileNews(data: NewsData): Promise<void> {
  await writeRecord(DIGEST_STORE, RECORD_KEY, data);
}

export function emptyMobileNews(windowHours: number): NewsData {
  return {
    generatedAt: new Date().toISOString(),
    windowHours,
    itemCount: 0,
    items: [],
    sources: [],
  };
}

export async function readTranslationEntries(): Promise<TranslationCacheEntry[]> {
  const value = await readRecord<unknown>(TRANSLATION_STORE, TRANSLATION_RECORD_KEY);
  if (!Array.isArray(value)) return [];
  return value.filter(
    (entry): entry is TranslationCacheEntry =>
      Boolean(entry) &&
      typeof entry === "object" &&
      typeof (entry as TranslationCacheEntry).key === "string" &&
      typeof (entry as TranslationCacheEntry).value === "string" &&
      typeof (entry as TranslationCacheEntry).usedAt === "number"
  );
}

export async function writeTranslationEntries(entries: TranslationCacheEntry[]): Promise<void> {
  await writeRecord(TRANSLATION_STORE, TRANSLATION_RECORD_KEY, entries);
}
