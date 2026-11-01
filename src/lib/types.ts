export type Region = "global" | "persian-diaspora" | "iran";

export interface SourceDef {
  id: string;
  name: string;
  country: string;
  flag: string;
  region: Region;
  lang: string;
  type: string;
  feeds: string[];
}

export interface NewsItem {
  id: string;
  title: string;
  summary: string;
  url: string;
  publishedAt: string;
  sourceId: string;
  sourceName: string;
  country: string;
  flag: string;
  region: Region;
  lang: string;
}

export interface SourceStatus {
  id: string;
  name: string;
  country: string;
  flag: string;
  region: Region;
  type: string;
  ok: boolean;
  count: number;
  ms: number;
  error?: string;
}

export interface NewsData {
  generatedAt: string;
  windowHours: number;
  itemCount: number;
  items: NewsItem[];
  sources: SourceStatus[];
}

export interface Settings {
  windowHours: number;
  autoRefreshMinutes: number;
  maxItems: number;
  sources: Record<string, { enabled: boolean }>;
}

export interface SettingsPayload {
  settings: Settings;
  registry: SourceDef[];
}

export type RefreshEvent =
  | { type: "start"; total: number; reason: string }
  | { type: "source"; source: SourceStatus }
  | { type: "done"; itemCount: number; generatedAt: string; ms: number }
  | { type: "error"; message: string };
