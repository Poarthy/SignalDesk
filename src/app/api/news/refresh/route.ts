import { NextRequest } from "next/server";
import { refreshManager, type JobEvent } from "@/server/refreshManager";
import { scheduler } from "@/server/scheduler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const { emitter, replay, job } = refreshManager.start("manual");
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      let lastSeq = replay.seq;

      const send = (event: JobEvent) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
        } catch {
          closed = true;
        }
      };
      const finish = () => {
        if (closed) return;
        closed = true;
        emitter.off("event", onEvent);
        try {
          controller.close();
        } catch { /* already closed */ }
      };
      const onEvent = (event: JobEvent, seq: number) => {
        if (seq <= lastSeq) return;
        lastSeq = seq;
        send(event);
        if (event.type === "done" || event.type === "error") finish();
      };

      for (const event of replay.events) send(event);
      if (replay.events.some((e) => e.type === "done" || e.type === "error")) {
        finish();
        return;
      }

      emitter.on("event", onEvent);
      req.signal.addEventListener("abort", finish, { once: true });
    },
  });

  // Re-align the background scheduler after a manual sync succeeds.
  void job.then((data) => {
    if (data) void scheduler.reschedule();
  });

  return new Response(stream, {
    headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store" },
  });
}
