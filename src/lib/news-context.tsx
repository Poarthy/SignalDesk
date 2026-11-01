"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ApiError, fetchNews, streamRefresh } from "@/lib/api";
import type { NewsData, SourceStatus } from "@/lib/types";
import { useToast } from "@/components/toast";

type Status = "loading" | "ready" | "bootstrapping" | "error";

interface RefreshOutcome {
  ok: boolean;
  delta: number;
}

interface NewsContextValue {
  data: NewsData | null;
  status: Status;
  now: number;
  refreshing: boolean;
  progress: { done: number; total: number };
  liveResults: SourceStatus[];
  lastDone: { itemCount: number; ms: number } | null;
  load: () => Promise<void>;
  startRefresh: () => Promise<RefreshOutcome>;
  refreshAndNotify: () => Promise<void>;
}

const NewsContext = createContext<NewsContextValue | null>(null);

export function useNews(): NewsContextValue {
  const ctx = useContext(NewsContext);
  if (!ctx) throw new Error("useNews must be used within NewsProvider");
  return ctx;
}

export function NewsProvider({ children }: { children: ReactNode }) {
  const toast = useToast();
  const [data, setData] = useState<NewsData | null>(null);
  const [status, setStatus] = useState<Status>("loading");
  const [now, setNow] = useState(() => Date.now());
  const [refreshing, setRefreshing] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [liveResults, setLiveResults] = useState<SourceStatus[]>([]);
  const [lastDone, setLastDone] = useState<{ itemCount: number; ms: number } | null>(null);

  const dataRef = useRef<NewsData | null>(null);
  const refreshingRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    dataRef.current = data;
  }, [data]);

  const load = useCallback(async () => {
    try {
      const next = await fetchNews();
      dataRef.current = next;
      setData(next);
      // Rehydrate the persisted source outcomes so Desk Controls survives a page reload.
      setLiveResults(next.sources);
      setStatus("ready");
    } catch (err) {
      if (err instanceof ApiError && err.status === 503) {
        if (!dataRef.current) setStatus("bootstrapping");
        return;
      }
      // Keep the last good digest on screen if a later fetch fails.
      if (!dataRef.current) setStatus("error");
    }
  }, []);

  // Initial load
  useEffect(() => {
    void load();
  }, [load]);

  // Poll while the server performs the very first sync
  useEffect(() => {
    if (status !== "bootstrapping") return;
    const timer = setInterval(() => void load(), 4000);
    return () => clearInterval(timer);
  }, [status, load]);

  // Relative-time ticker
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);

  // Abort an in-flight stream when the app unmounts
  useEffect(() => () => abortRef.current?.abort(), []);

  const startRefresh = useCallback(async (): Promise<RefreshOutcome> => {
    if (refreshingRef.current) return { ok: false, delta: 0 };
    refreshingRef.current = true;
    setRefreshing(true);
    setLiveResults([]);
    setProgress({ done: 0, total: 0 });
    setLastDone(null);

    const beforeIds = new Set(dataRef.current?.items.map((i) => i.id) ?? []);
    const controller = new AbortController();
    abortRef.current = controller;
    let delta = 0;

    try {
      await streamRefresh({
        signal: controller.signal,
        onEvent: (event) => {
          if (event.type === "start") {
            setProgress((p) => ({ ...p, total: event.total }));
          } else if (event.type === "source") {
            setLiveResults((list) => [...list, event.source]);
            setProgress((p) => ({ ...p, done: p.done + 1 }));
          } else if (event.type === "done") {
            setLastDone({ itemCount: event.itemCount, ms: event.ms });
          }
        },
      });
      await load();
      const after = dataRef.current;
      if (after) delta = after.items.filter((i) => !beforeIds.has(i.id)).length;
      return { ok: true, delta };
    } catch (err) {
      if ((err as Error)?.name !== "AbortError") {
        toast(err instanceof Error && err.message ? err.message : "Refresh failed", "error");
      }
      return { ok: false, delta: 0 };
    } finally {
      refreshingRef.current = false;
      setRefreshing(false);
    }
  }, [load, toast]);

  const refreshAndNotify = useCallback(async () => {
    const result = await startRefresh();
    if (result.ok) {
      toast(
        result.delta > 0 ? `Synced — ${result.delta} new ${result.delta === 1 ? "story" : "stories"}` : "Synced — you're up to date",
        "success"
      );
    }
  }, [startRefresh, toast]);

  // Keyboard shortcut: press R to sync
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== "r" || e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT" || target.isContentEditable)
      ) {
        return;
      }
      e.preventDefault();
      void refreshAndNotify();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [refreshAndNotify]);

  const value = useMemo<NewsContextValue>(
    () => ({ data, status, now, refreshing, progress, liveResults, lastDone, load, startRefresh, refreshAndNotify }),
    [data, status, now, refreshing, progress, liveResults, lastDone, load, startRefresh, refreshAndNotify]
  );

  return <NewsContext.Provider value={value}>{children}</NewsContext.Provider>;
}
