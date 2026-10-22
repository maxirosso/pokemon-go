# Development guide

## Prerequisites

- Node.js 20+ and npm
- For devices: Expo Go (limited — see below), or Android Studio / Xcode for development builds
- Optional: Supabase CLI (AI coach + cloud backup), Maestro CLI (E2E), Python 3 + Pillow (icon generation)

Stack: Expo SDK 58 · React Native 0.88 · React 19 · Expo Router 58 · TypeScript (strict) · Zustand · TanStack Query · Zod · Reanimated · expo‑sqlite.

> This project follows the repo's `AGENTS.md`: Expo APIs change between SDKs — check the versioned docs (`https://docs.expo.dev/versions/v58.0.0/`) before touching Expo/RN APIs, and add packages with `npx expo install <pkg>`.

## Run

```bash
npm install
npx expo start          # press a / i / w, or scan the QR with Expo Go
```

| Target | Works in Expo Go | Notes |
|---|---|---|
| Collection, engine, PvP, raids, Pokédex, import (file/manual), backup | ✅ | |
| Screenshot OCR (ML Kit) | ❌ | native module → development build |
| Local notifications | ✅ (device) | not supported on web |
| Web (`npm run web`) | ✅ for visual checks | uses expo‑sqlite's WASM/OPFS build; `metro.config.js` sets the COOP/COEP headers it needs. If a web tab ever shows nothing, see Troubleshooting |

### Development build (native modules)

```bash
npm run run:android      # local build, needs Android SDK + emulator/device
npm run run:ios          # macOS only
npx eas build --profile development --platform android   # cloud build (EAS account required)
npx expo start --dev-client
```

Profiles are in `eas.json` (`development`, `development-simulator`, `preview`, `production`). Bundle ids are `app.gocompass.companion` (change before publishing).

## Quality gates

```bash
npm run check           # tsc --noEmit  +  eslint src tests  +  jest
npm run typecheck
npm run lint
npm test                # add -- <pattern> for a single file, e.g. npm test -- cp
npm run format          # prettier
```

Jest uses `jest-expo`, custom mocks in `tests/setup.ts` (Reanimated, Lucide icons, AsyncStorage), RNTL v14 (**`render`/`fireEvent` are async — `await` them**), and a `node:sqlite` adapter (`tests/sqliteAdapter.ts`) so repository and migration tests run the real SQL. Fixtures: `tests/helpers.ts` builds a `ReferenceData` from the bundled snapshot.

### End‑to‑end (Playwright, web)

```bash
npm run e2e:web         # starts `expo start --web` on :8099 (or reuses it) and runs e2e/*.spec.ts in Google Chrome
npm run e2e:web:report  # open the HTML report (traces + screenshots are kept for failures)
```

Specs live in `e2e/`: `onboarding`, `add-pokemon` and `advisor` (16 tests). Each test gets a fresh browser context, so it starts with empty SQLite storage. Requires Google Chrome installed (`channel: 'chrome'`), so no browser download. The first run is slow while Metro bundles. These cover the web build only — native paths (ML Kit OCR, notifications, gestures) are not exercised.

### End‑to‑end (Maestro, native)

```bash
# with a dev build installed and running on an emulator/device
npm run e2e             # maestro test .maestro
```

Flows: `.maestro/onboarding-demo.yaml`, `.maestro/add-pokemon.yaml`. These have not been run in CI here and should be treated as starter flows.

## Reference data

The bundled snapshot in `src/data/reference/` is generated:

```bash
npm run snapshot:reference
```

It downloads PoGoAPI + PvPoke files, minifies them and writes `manifest.json` (SHA‑256 per file). Re‑run before each release, then `npm test` — the reference and mechanics tests catch schema drift and implausible values. Runtime refresh is described in DATA_SOURCES.md.

## Optional: Supabase + Gemini (AI coach, cloud backup)

Everything below is **optional**; without it the AI screen answers from the on‑device tools and says the cloud coach isn't configured.

1. **Create a Supabase project** (free tier is fine). In *Authentication → Providers*, enable **Anonymous sign‑ins** (guest mode uses it for rate limiting — no email/password).
2. **Apply the migration** (`supabase/migrations/0001_init.sql`): `ai_usage` + `consume_ai_quota()` and `collection_backups` with Row Level Security.
   ```bash
   supabase login
   supabase link --project-ref <your-project-ref>
   supabase db push
   ```
3. **Get a Gemini API key** from Google AI Studio (https://aistudio.google.com/apikey) and store it as an Edge Function **secret** — never in `.env` or the app:
   ```bash
   supabase secrets set GEMINI_API_KEY=<your-key>
   supabase secrets set GEMINI_MODEL=gemini-2.5-flash                 # optional (default)
   supabase secrets set GEMINI_FALLBACK_MODEL=gemini-2.5-flash-lite   # optional (default)
   supabase secrets set AI_HOURLY_LIMIT=20 AI_DAILY_LIMIT=120         # optional (defaults)
   ```
4. **Deploy the function** (JWT verification stays on):
   ```bash
   supabase functions deploy gemini-coach
   ```
5. **Point the app at your project** with the *public* values only:
   ```bash
   # create a local .env (git-ignored) containing EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY
   ```
   Restart `npx expo start` (add `-c` to clear the cache). Settings → Cloud shows the connection status.

### Free‑tier caveats

- Gemini's free‑tier models, per‑minute/per‑day request limits and data‑use terms **change over time**; check Google AI Studio's current rate‑limit page and terms before relying on them. This project targets Flash / Flash‑Lite class models, and the function falls back to the lite model on 404/503 from the primary.
- The per‑user limits above protect *your* quota from one user; they are not Google's limits. If Google returns a 429 the app shows "AI quota reached… try again shortly" and keeps working locally.
- Free‑tier terms may allow Google to use prompts to improve products. The app therefore sends only compact tool results, and screenshots only after explicit consent. Review Google's terms (and consider a paid tier) before enabling this for other people.
- The Edge Function was written against the Supabase/Deno and Gemini REST API shapes as understood at build time. It has **not been deployed against a live Supabase project or a live Gemini key in this repository's test runs**, so expect to verify it end‑to‑end once (ask a question in the Assistant screen, watch `supabase functions logs gemini-coach`).

## Project conventions

- `src/engine` stays free of React Native / Expo imports (tests depend on it).
- External data → Zod schema at the boundary; no `any` leaking into the engine.
- New SQLite change → append a migration in `services/database/schema.ts` (never edit a shipped one) and bump `LATEST_VERSION`; add a repository test.
- Strings go through `src/i18n` (EN + ES).
- Don't add features that imply an official Pokémon GO connection or fabricate data; demo data must carry `source: 'demo'`.

## Troubleshooting

| Symptom | Fix |
|---|---|
| "Text recognition needs a development build" | Expected in Expo Go/web — build a dev client (see above) |
| Blank web page | Seen in the embedded preview pane when it was hidden (the page never finished loading while backgrounded) — make sure the tab is visible; if it persists clear site storage (OPFS `expo-sqlite`) and check Metro logs. Not reproduced in a visible browser tab after the last changes, but not re-verified either |
| Stale/odd data after changing the snapshot | Settings → Data sources (reference data) → refresh, or Settings → Backup & data → Reset |
| Type errors in `supabase/` | That folder targets Deno and is excluded from `tsconfig.json` |
| AI says "not configured" | `.env` values missing/mistyped, or Metro not restarted with `-c` |
