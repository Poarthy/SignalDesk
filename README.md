# SignalDesk

**A local-first news desk for global affairs & Iranian geopolitics.** 15 RSS/Atom
sources → one tracker-free JSON digest, served by a single Next.js app.

![version](https://img.shields.io/badge/version-2.1.0-0f172a?style=flat-square)
![Next.js](https://img.shields.io/badge/Next.js-16.3.4-000000?style=flat-square&logo=next.js&logoColor=white)
![React](https://img.shields.io/badge/React-19.2.8-087ea4?style=flat-square&logo=react&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-7.0.2-3178c6?style=flat-square&logo=typescript&logoColor=white)
![Tailwind](https://img.shields.io/badge/Tailwind-4.1.8-38bdf8?style=flat-square&logo=tailwindcss&logoColor=black)
![Node](https://img.shields.io/badge/Node-%3E%3D20.18-339933?style=flat-square&logo=node.js&logoColor=white)
![Trackers](https://img.shields.io/badge/trackers-0-10b981?style=flat-square)

## Preview

| Live desk | Search + highlight |
| --- | --- |
| ![Live desk](docs/screenshots/01-desk-global.png) | ![Search highlight](docs/screenshots/02-search-highlight.png) |
| **Dark theme** | **Desk controls** |
| ![Dark theme](docs/screenshots/03-dark-theme.png) | ![Desk controls](docs/screenshots/04-desk-controls.png) |
| **Desk menu** | **Persian desk** |
| ![Desk menu](docs/screenshots/compact/category-menu-open-1440-light.png) | ![Persian desk](docs/screenshots/06-desk-iran.png) |

## What it does

- **Three desks, one feed** — Global (8 sources), Persian diaspora (2), Iran (5);
  switch with the desk dropdown, counts animate per desk.
- **Rolling window** — only stories newer than 6/12/24/48h are kept (default 12h);
  stale items retire automatically.
- **Live search** — filters titles, summaries and sources on every keystroke and
  highlights matches; `x` clears.
- **EN → FA translation** — per-story `FA`/`EN` toggle (Google GTX, MyMemory
  fallback, 600-entry local cache); Persian desks render RTL natively.
- **Desk controls panel** — time window, auto-sync interval (Off…12h), per-source
  on/off switches, save/reset, plus live per-source results after each sync.
- **Manual sync with progress** — NDJSON stream drives a progress ring, per-source
  rows (`✓ 25 items · 406ms`) and toasts. Shortcut: `R`.
- **Auto-refresh scheduler** — server-side loop, off by default in the shipped
  settings, reschedules after every settings change.
- **Tracker-free** — no CDN, no remote images, no analytics; fonts and the
  lion-and-sun flag are bundled, favicon is a `data:` URI.
- **Light/dark theme:** default dark, `class="dark"` swap, persisted in
  `localStorage`.
- **Cheap by design** — single-file digest (`data/news.json`), ETag/304 on
  `GET /api/news`, 30 cards per page with lazy pagination.

## Quick start

```bash
npm ci
npm run build     # runs the feed fetch first (needs internet), then next build
npm start         # http://localhost:3000
```

Other scripts: `npm run dev` (Turbopack dev server), `npm run news` (re-pull feeds
only), `npm run typecheck`. Requires Node >= 20.18.

## Android

The APK is built in GitHub Actions, never in the local checkout.
Run **Android APK** from the Actions tab, then download its artifact.
Add signing secrets only when you need a stable release APK.
See [the Android build guide](docs/ANDROID.md) for the full workflow and troubleshooting.

## Fonts

SignalDesk self-hosts Bricolage Grotesque (The Bricolage Grotesque Project
Authors) and Manrope (The Manrope Project Authors), both under the SIL Open Font
License 1.1. Vazirmatn remains bundled for Arabic-script text.

## Controls

| Input | Action |
| --- | --- |
| `R` | sync the wire now |
| `Esc` | close the desk-controls panel |
| `↑` / `↓` in the desk menu | move between desks |
| Search box | live filter + highlight |

## API

| Method | Route | Purpose |
| --- | --- | --- |
| `GET` | `/api/news` | digest JSON (ETag / 304) |
| `POST` | `/api/news/refresh` | single-flight resync, streams NDJSON events |
| `GET` | `/api/settings` | settings + source registry |
| `PATCH` | `/api/settings` | `windowHours` (1–48), `autoRefreshMinutes`, `maxItems`, `sources` |
| `POST` | `/api/translate` | `{"texts": [...]}` → Persian (1–5 texts) |
| `GET` | `/api/health` | node version, uptime, story count |

## Layout

```
src/app/        pages + API routes
src/server/     newsService · refreshManager · scheduler · store
src/components/ Header · ControlPanel · RegionSelect · NewsCard …
src/lib/        sources.json (15 feeds) · highlight · api · types
data/           settings.json (tracked) · news.json (generated, gitignored)
```
## Contributing

Contributions are welcome, including AI-assisted and vibe-coded changes. Please
fork this repository, make your changes on a branch, and open a pull request
with a clear summary and any relevant testing notes. Keep contributions
respectful of the project goals and do not include secrets or private data.

This project is licensed under the MIT License; see [LICENSE](LICENSE).
