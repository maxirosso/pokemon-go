# GO Compass

> *Open the app. It knows which Pokémon you have, analyses their value, and tells you exactly what to do next — and why.*

GO Compass is an **unofficial**, offline-first companion app for Pokémon GO players, built with React Native + Expo + TypeScript. It is not affiliated with, endorsed by or connected to Niantic, Nintendo, The Pokémon Company or Game Freak. See [Legal & privacy](#legal--privacy).

You tell the app what you own (manually, from screenshots, or from a CSV/JSON file). A deterministic TypeScript engine — grounded in real Pokémon GO mechanics and versioned game data — rates every Pokémon for raids, gyms, PvP and general use, then ranks what you should power up, evolve, trade, keep or transfer, given your actual resources and goals. Every verdict lists the evidence behind it, and says plainly when your data is incomplete.

## Highlights

- **Recommendations you can audit** – each verdict (power up / evolve / keep / transfer…) shows its evidence, confidence and the dataset version it used. Unknown IVs are never guessed as 15/15/15 or 0/0/0; the app shows ranges and what extra information would narrow them.
- **Collection manager** – many separate records per species, filters, sorts, tags, favourites, a Pokémon GO‑style search subset (e.g. `fire&!shiny, water&4*`), soft deletion with "Recently deleted".
- **Add / import** – manual add with IV sliders and honest level estimation (CP + HP → candidate levels); screenshot import with on‑device OCR and a mandatory editable review step; CSV / JSON import; backup & restore.
- **Account‑wide strategy** – priorities, a budget planner with three plans, resource tracking (Stardust, candy, XL candy…), evolution advisor and power‑up calculator.
- **Raid assistant** – best six counters *from your own Pokémon* for a boss, with weather / friendship / mega modifiers. Results are model estimates, not promises.
- **PvP** – stat‑product IV ranking for Great / Ultra / Master (and Little) league, league suitability, 1v1 simulator, team builder with threat/coverage analysis.
- **Pokédex** (separate from your collection), species detail with artwork, evolution trees, type coverage.
- **AI coach (optional)** – Gemini Flash‑Lite using your own API key, stored only on your device (or, optionally, via a Supabase Edge Function). Gemini never sees your database; it can only call a fixed set of read‑only app tools. Without internet / backend, the app answers from the same tools locally.
- **Premium dark design ("Midnight Orbit")** with a light theme, reduced‑motion support, English and Spanish.
- **Local notifications only** – opt‑in reminders built from *your own* plan and milestones. No fake "live event" notices.

## Quick start

Requirements: Node 20+, npm, and either the Expo Go app or an Android/iOS simulator.

```bash
npm install
npx expo start
```

Then press `a` (Android), `i` (iOS), `w` (web) or scan the QR code with Expo Go.

The app works completely offline from first launch: a validated reference snapshot (game data + PvP rankings) is bundled and later refreshed in the background.

### Development build (needed for on‑device OCR)

Screenshot OCR uses Google ML Kit text recognition, which is a **native module and does not run in Expo Go or on web**. Everything else does. To try OCR:

```bash
npm run run:android      # expo run:android  (needs Android Studio + SDK)
npm run run:ios          # expo run:ios      (macOS + Xcode)
# or cloud builds:
npx eas build --profile development --platform android
```

In Expo Go / web the screenshot screen degrades gracefully: you can still pick images and type the values into the same review form.

### Useful scripts

| Command | What it does |
|---|---|
| `npm run check` | typecheck + lint + all tests |
| `npm test` | Jest unit / integration / component tests |
| `npm run snapshot:reference` | Re‑download and re‑validate the bundled reference snapshot |
| `npm run e2e:web` | Playwright web end‑to‑end tests in `e2e/` (needs Google Chrome) |
| `npm run e2e` | Maestro flows in `.maestro/` (needs a running dev build + Maestro CLI) |
| `npm run icons` | Regenerate app icons (`python`, Pillow) |

Full developer guide, including Supabase + Gemini setup: [DEVELOPMENT.md](DEVELOPMENT.md).

## Feature status — honest matrix

| Area | Status | Notes |
|---|---|---|
| Onboarding, guest mode, profile & goals | ✅ Complete | |
| Collection manager, filters, search, tags, soft delete | ✅ Complete | Search is a documented *subset* of GO's syntax |
| Manual add with IV sliders / level estimation | ✅ Complete | |
| Pokémon detail, role ratings, explainable verdicts | ✅ Complete | Ratings are *estimates* (see GAME_MECHANICS.md) |
| Recommendation engine, account analysis, roadmap, budget plans | ✅ Complete | Deterministic and unit‑tested |
| Evolution advisor, power‑up calculator | ✅ Complete | Shadow / purified / lucky costs use documented approximations |
| Raid assistant | ✅ Complete | Analytical model; boss HP/level per tier are model constants |
| PvP rankings, simulator, team builder | ✅ Complete | Meta ratings from PvPoke; simulator is a simplified 1v1 |
| Pokédex, species info, artwork | ✅ Complete | Artwork needs network (PokéAPI / cached after first view) |
| Backup / restore / CSV / JSON import / reset | ✅ Complete | |
| Reference data update with last‑known‑good fallback | ✅ Complete | Atomic, validated, versioned |
| EN / ES localisation | 🟡 Partial | Core flows translated; some deep‑detail strings are English only |
| Screenshot OCR import | 🟡 Partial | Requires a **dev build** (native ML Kit); parsing heuristics are English‑oriented; always user‑reviewed |
| Local notifications | 🟡 Partial | Scheduling works on device; web has no support |
| AI coach (Gemini) | 🟡 Needs your key | Code complete and unit/e2e tested against a mocked API; **not yet run against the live Gemini API**. Paste your key in Settings (stored on the device only); free‑tier quotas apply and change over time |
| AI screenshot analysis (Gemini vision) | 🟡 Needs your setup | Opt‑in with explicit consent each time; result goes to the same review step |
| Cloud backup (Supabase) | 🟡 Needs your setup | Optional; local backup works without it |
| Web E2E (Playwright) | ✅ Passing | 16 tests: onboarding, add Pokémon, advisor (web build, Chrome) |
| Maestro E2E (native) | 🟡 Not run | Two starter flows written; never executed (needs Maestro + a device/emulator) |
| Native device testing (real iOS / Android hardware) | ❌ Not verified | Automated tests run under Jest/Node; UI was smoke‑tested on web only |
| Pokémon GO account connection | ⛔ Intentionally unavailable | There is no official API. See below |

## What is deliberately NOT in this app

No login with a Pokémon GO account, no credential entry, no session‑token extraction, no private/reverse‑engineered endpoints, no location spoofing, no botting, and no misleading "Connect Pokémon GO" button. Your collection comes only from what **you** enter or import. The demo collection is clearly labelled "demo" and can be removed in one tap.

## Documentation

- [ARCHITECTURE.md](ARCHITECTURE.md) – layers, data flow, database, AI design
- [DATA_SOURCES.md](DATA_SOURCES.md) – every external source, licensing caveats, freshness
- [GAME_MECHANICS.md](GAME_MECHANICS.md) – formulas, model constants, known approximations
- [DEVELOPMENT.md](DEVELOPMENT.md) – setup, testing, Supabase/Gemini, release notes

## Legal & privacy

- **Unofficial.** Pokémon and Pokémon GO are trademarks of their respective owners. Names and artwork are used for identification only. Before publishing to a store, review trademark/IP exposure of the app name, icon and artwork (see DATA_SOURCES.md).
- **Privacy.** Data stays on your device by default. Screenshots are processed locally unless you explicitly opt in to cloud analysis. No Gemini key ships with the app: you enter your own, and it stays in the device's secure storage (never in code, backups or git).
- **Attributions.** PoGoAPI, PvPoke, PokéAPI — see DATA_SOURCES.md and the in‑app About screen.

## License

No license has been chosen for GO Compass yet. The `LICENSE` file in this repository is the MIT text inherited from the Expo project template (copyright 650 Industries) and does **not** describe this app's own terms — replace it with the license you want before publishing.
