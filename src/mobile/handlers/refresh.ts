import type { NewsData, RefreshEvent, SourceStatus } from "../../lib/types";
import { refreshMobileDigest } from "../engine";
import type { MobileRequest } from "../request";
import { jsonResponse } from "../request";
import { readMobileSettings } from "../storage";
import { nowMs } from "../utils";

interface RecordedEvent {
  event: RefreshEvent;
  sequence: number;
}

type Subscriber = (record: RecordedEvent) => void;

class MobileRefreshJob {
  readonly events: RecordedEvent[] = [];
  readonly listeners = new Set<Subscriber>();
  done = false;
  promise!: Promise<NewsData | null>;
  private sequence = 0;

  emit(event: RefreshEvent): void {
    const record = { event, sequence: (this.sequence += 1) };
    this.events.push(record);
    for (const listener of this.listeners) listener(record);
  }

  subscribe(listener: Subscriber): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}

class MobileRefreshManager {
  private current: MobileRefreshJob | null = null;

  isRunning(): boolean {
    return this.current !== null;
  }

  start(reason: string): MobileRefreshJob {
    if (this.current) return this.current;

    const job = new MobileRefreshJob();
    this.current = job;
    job.promise = (async (): Promise<NewsData | null> => {
      const startedAt = nowMs();
      try {
        const settings = await readMobileSettings();
        const enabled = Object.values(settings.sources).filter((source) => source.enabled).length;
        job.emit({ type: "start", total: enabled, reason });
        const data = await refreshMobileDigest(settings, (source: SourceStatus) => job.emit({ type: "source", source }));
        job.emit({
          type: "done",
          itemCount: data.itemCount,
          generatedAt: data.generatedAt,
          ms: Math.round(nowMs() - startedAt),
        });
        return data;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        job.emit({ type: "error", message });
        return null;
      } finally {
        job.done = true;
        this.current = null;
      }
    })();
    return job;
  }
}

const manager = new MobileRefreshManager();

export function isMobileRefreshRunning(): boolean {
  return manager.isRunning();
}

export async function runMobileRefresh(reason: string): Promise<NewsData | null> {
  return manager.start(reason).promise;
}

export function handleMobileRefresh(request: MobileRequest): Response {
  const job = manager.start("manual");
  const encoder = new TextEncoder();
  let unsubscribe = () => {};

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      let lastSequence = 0;
      const close = () => {
        if (closed) return;
        closed = true;
        unsubscribe();
        try {
          controller.close();
        } catch {
          // A consumer may have cancelled before the terminal event arrives.
        }
      };
      const send = (record: RecordedEvent) => {
        if (closed || record.sequence <= lastSequence) return;
        lastSequence = record.sequence;
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(record.event)}\n`));
          if (record.event.type === "done" || record.event.type === "error") close();
        } catch {
          close();
        }
      };

      unsubscribe = job.subscribe(send);
      for (const record of job.events) send(record);
      request.signal?.addEventListener("abort", close, { once: true });
      if (job.done) close();
    },
    cancel() {
      unsubscribe();
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "application/x-ndjson; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

export function refreshMethodNotAllowed(method: string): Response {
  return jsonResponse({ error: `Method ${method} not allowed` }, { status: 405, headers: { allow: "POST" } });
}
