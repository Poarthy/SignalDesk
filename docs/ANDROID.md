# Android APK

SignalDesk's Android APK is built only by GitHub Actions. The repository does not contain a generated `android/` project, an APK, or a signing key.

```text
Android APK
  Capacitor WebView (https://localhost)
    Next.js static export (out/)
      local fetch(/api/*) engine
        native HTTP, DOMParser, IndexedDB, localStorage
```

The web app keeps its existing Next.js server routes and filesystem-backed store. In the mobile build, the workflow removes those routes from its temporary checkout before exporting the UI. A mobile-only fetch shim serves the same UI contracts on-device, with IndexedDB for the digest and translation cache, localStorage for settings, and Capacitor HTTP for feed requests without browser CORS restrictions.

## Run a build

1. Push `feat/android-apk` to GitHub and open **Actions**.
2. Choose **Android APK**, click **Run workflow**, and select `debug` or `release`.
3. Download the `signaldesk-apk-<run-number>` artifact from the completed run.
4. To create a GitHub Release, tag and push a version such as `v2.1.0`. A tagged build uses release signing when the keystore secrets exist, otherwise it publishes a debug APK.

The workflow builds a debug APK by default. Debug builds are installable, but GitHub's runner uses a new debug signing key, so an older debug APK usually must be uninstalled before installing the next one.

## Stable release signing

Create a keystore once on a machine with a JDK:

```bash
keytool -genkeypair -v -keystore signaldesk.jks -alias signaldesk -keyalg RSA -keysize 2048 -validity 10000
base64 -w0 signaldesk.jks
```

Add these repository secrets in GitHub: `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, and `ANDROID_KEY_PASSWORD`. Then choose the `release` variant. Never commit a keystore. This repository is public, and artifacts from public repositories are visible to others, so never upload a keystore or any secret as an artifact.

## API compatibility

The shim uses standard `Response` and `ReadableStream` objects, so `src/lib/api.ts` continues to read refresh progress with `response.body.getReader()`.

| Route | Mobile behavior |
| --- | --- |
| `GET /api/news` | Returns the stored digest with `200`. On first run it returns a valid empty digest with the normal `NewsData` shape. The server-only ETag and `304` behavior is intentionally omitted. |
| `POST /api/news/refresh` | Returns `200` NDJSON with `content-type: application/x-ndjson; charset=utf-8`. It is single-flight and joins an active refresh through event replay. |
| `GET /api/settings` | Returns `{ settings, registry }` with `200`. |
| `PATCH /api/settings` | Returns `{ settings }` with `200`, or `{ error }` with `400` for invalid JSON or validation errors. |
| `POST /api/translate` | Returns `{ translations }` with `200`, `{ error }` with `400` for invalid input, and `{ error }` with `502` if both translation providers fail. |
| `GET /api/health` | Returns a local mobile health payload with `200`. |

Refresh NDJSON records have the same event objects as the server: `{ "type": "start", "total": number, "reason": string }`, `{ "type": "source", "source": SourceStatus }`, `{ "type": "done", "itemCount": number, "generatedAt": string, "ms": number }`, and terminal `{ "type": "error", "message": string }` when a refresh fails.

## Known limitations

- Auto-refresh runs only while the app is foregrounded. It is re-armed after settings changes and checks freshness on resume. There is no background sync while the app is closed.
- Feed retrieval depends on the publishers, Google GTX, and MyMemory. Some feeds can reject a non-browser user agent.
- CNN is the one configured `http://` feed, so the workflow sets Android's cleartext exception. Capacitor still disallows mixed WebView content.
- Capacitor's HTTP fetch patch, generated Android template paths, edge-to-edge insets, and the Capacitor version selected by `latest` are verified by the first GitHub-hosted build, not locally.

## Troubleshooting

Open the failed run, read the failed step's log, and download the `signaldesk-build-logs-<run-number>` artifact if it exists. Paste the failed step name, its complete error output, and the relevant Gradle log back into the issue or follow-up request. Do not paste signing secrets or a keystore.

## Audit notes

- `src/app/page.tsx` is a client component and neither it nor `src/app/layout.tsx` reads `data/news.json` or calls `src/server/*` during render. The mobile build starts with an empty digest and triggers one foreground sync.
- No client component imports `src/server/*`. `src/instrumentation.ts` only dynamically imports the server scheduler when Next runs with the Node runtime.
- `src/lib/api.ts` uses a standard stream reader for refresh events, so an intercepted standard `Response` is sufficient.
- All shipped fonts use local `@font-face` files under `public/fonts`; images are local and there are no remote scripts, analytics, or remote images.
- `src/lib/sources.json` contains one cleartext feed, `http://rss.cnn.com/rss/edition_world.rss`. The workflow therefore sets `ALLOW_CLEARTEXT=1` for the generated manifest.
- Node-only modules appear in the server, API routes, or server-only instrumentation. Client-reachable code uses browser APIs only.
- Empty, loading, bootstrap, and error states already exist in the desk. The web bootstrap state polls a server `503`; mobile instead returns an empty digest and starts its first sync from `MobileBootstrap`.
- There is no middleware, `next/image`, dynamic page route, redirect configuration, or server page data dependency that blocks the static export. Dynamic API routes are removed only in CI before the mobile build.

## Mobile UI decisions

Design read: existing compact news desk for readers monitoring global and Iranian headlines, using its established editorial dark and warm-orange visual language, dial ENERGY 1 / RHYTHM 1 / MOTION 1.

- Safe-area padding protects the established masthead and footer from Android system bars without changing the desk layout.
- Coarse-pointer controls use a 44px minimum height so existing actions remain easy to tap.
- The scrollable controls panel preserves its current information hierarchy on short screens.
- The hand-written adaptive icon is the explicit signal mark requested for the Android package and uses the existing dark surface with the desk's orange accent.
