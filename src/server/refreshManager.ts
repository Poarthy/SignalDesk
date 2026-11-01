import { EventEmitter } from "node:events";
import type { NewsData, SourceStatus } from "../lib/types";
import { collectNews } from "./newsService";
import { enabledSources, readSettings, writeNews } from "./store";
import { log } from "./logger";

export type JobEvent =
  | { type: "start"; total: number; reason: string }
  | { type: "source"; source: SourceStatus }
  | { type: "done"; itemCount: number; generatedAt: string; ms: number }
  | { type: "error"; message: string };

export interface JobHandle {
  emitter: EventEmitter;
  replay: { events: JobEvent[]; seq: number };
  job: Promise<NewsData | null>;
  alreadyRunning: boolean;
}

/**
 * One refresh at a time. Concurrent callers attach to the running job and
 * receive a replay of already-emitted events plus live ones (seq numbers
 * guarantee no duplicates and no gaps).
 */
class RefreshManager {
  private emitter: EventEmitter | null = null;
  private job: Promise<NewsData | null> | null = null;
  private eventLog: JobEvent[] = [];
  private seq = 0;

  isRunning(): boolean {
    return this.job !== null;
  }

  start(reason: string): JobHandle {
    if (this.job && this.emitter) {
      return {
        emitter: this.emitter,
        replay: { events: [...this.eventLog], seq: this.seq },
        job: this.job,
        alreadyRunning: true,
      };
    }

    const emitter = new EventEmitter();
    emitter.setMaxListeners(64);
    this.eventLog = [];
    this.seq = 0;

    const emit = (event: JobEvent) => {
      this.eventLog.push(event);
      this.seq += 1;
      emitter.emit("event", event, this.seq);
    };

    const job = (async (): Promise<NewsData | null> => {
      const startedAt = performance.now();
      try {
        const settings = await readSettings();
        emit({ type: "start", total: enabledSources(settings).length, reason });
        const data = await collectNews(settings, (source) => emit({ type: "source", source }));
        await writeNews(data);
        emit({
          type: "done",
          itemCount: data.itemCount,
          generatedAt: data.generatedAt,
          ms: Math.round(performance.now() - startedAt),
        });
        return data;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        log.error("refresh failed:", message);
        emit({ type: "error", message });
        return null;
      } finally {
        this.job = null;
      }
    })();

    this.emitter = emitter;
    this.job = job;
    return { emitter, replay: { events: [...this.eventLog], seq: this.seq }, job, alreadyRunning: false };
  }
}

const g = globalThis as typeof globalThis & { __newsHubRefreshManager?: RefreshManager };
export const refreshManager = (g.__newsHubRefreshManager ??= new RefreshManager());
