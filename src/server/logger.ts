const ts = () => new Date().toISOString();

export const log = {
  info: (...args: unknown[]) => console.log(`[news-hub ${ts()}]`, ...args),
  warn: (...args: unknown[]) => console.warn(`[news-hub ${ts()}]`, ...args),
  error: (...args: unknown[]) => console.error(`[news-hub ${ts()}]`, ...args),
};
