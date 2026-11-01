import { readNews, readSettings } from "./store";
import { refreshManager } from "./refreshManager";
import { log } from "./logger";

class Scheduler {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private shuttingDown = false;

  async init(): Promise<void> {
    await this.reschedule();
    
    // FIX: Add graceful shutdown handlers
    if (typeof process !== "undefined") {
      process.once("SIGTERM", () => this.shutdown());
      process.once("SIGINT", () => this.shutdown());
    }
  }

  async reschedule(): Promise<void> {
    if (this.shuttingDown) return;
    
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    const settings = await readSettings();
    if (!settings.autoRefreshMinutes) {
      log.info("auto-refresh: off");
      return;
    }
    const intervalMs = settings.autoRefreshMinutes * 60_000;
    const data = await readNews();
    const age = data ? Date.now() - Date.parse(data.generatedAt) : Number.POSITIVE_INFINITY;
    const expired = data ? age > settings.windowHours * 3_600_000 : true;
    const delay = !data || expired ? 1_500 : Math.max(1_500, intervalMs - age);
    this.timer = setTimeout(() => void this.tick(), delay);
    log.info(`auto-refresh: next in ${(delay / 60_000).toFixed(1)} min (every ${settings.autoRefreshMinutes} min)`);
  }

  private async tick(): Promise<void> {
    if (this.shuttingDown) return;
    
    try {
      const { job } = refreshManager.start("scheduler");
      await job;
    } catch {
      /* already logged by the manager */
    }
    await this.reschedule();
  }

  private shutdown(): void {
    this.shuttingDown = true;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    log.info("scheduler: shutdown complete");
  }
}

const g = globalThis as typeof globalThis & { __newsHubScheduler?: Scheduler };
export const scheduler = (g.__newsHubScheduler ??= new Scheduler());
