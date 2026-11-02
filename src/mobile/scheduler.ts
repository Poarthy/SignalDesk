import { runMobileRefresh } from "./handlers/refresh";
import { readMobileNews, readMobileSettings } from "./storage";

let timer: ReturnType<typeof setTimeout> | null = null;
let initialized = false;

function clearTimer(): void {
  if (timer) clearTimeout(timer);
  timer = null;
}

export async function rescheduleMobileRefresh(): Promise<void> {
  clearTimer();
  const settings = await readMobileSettings();
  if (!settings.autoRefreshMinutes) return;

  const digest = await readMobileNews();
  const intervalMs = settings.autoRefreshMinutes * 60_000;
  const age = digest ? Date.now() - Date.parse(digest.generatedAt) : Number.POSITIVE_INFINITY;
  const delay = !digest || age >= intervalMs ? 1_500 : Math.max(1_500, intervalMs - age);
  timer = setTimeout(() => {
    void (async () => {
      await runMobileRefresh("scheduler");
      await rescheduleMobileRefresh();
    })();
  }, delay);
}

async function refreshOnResume(): Promise<void> {
  if (document.visibilityState !== "visible") return;
  const settings = await readMobileSettings();
  if (!settings.autoRefreshMinutes) return;
  const digest = await readMobileNews();
  const age = digest ? Date.now() - Date.parse(digest.generatedAt) : Number.POSITIVE_INFINITY;
  if (age >= settings.autoRefreshMinutes * 60_000) await runMobileRefresh("resume");
  await rescheduleMobileRefresh();
}

export async function startMobileScheduler(): Promise<void> {
  if (!initialized) {
    initialized = true;
    document.addEventListener("visibilitychange", () => void refreshOnResume());
  }
  await rescheduleMobileRefresh();
}
