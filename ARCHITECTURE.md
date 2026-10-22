# Architecture

## Principles

1. **The app works without a network and without any account.** AI, cloud backup and live data refresh are optional layers.
2. **Deterministic core.** Every number and verdict comes from a pure TypeScript engine. The AI explains and navigates; it does not invent game facts.
3. **Honesty about uncertainty.** Unknown IVs/levels are modelled explicitly, shown as ranges, and lower confidence. Estimates are labelled estimates.
4. **Reference data ≠ user data.** Game data is versioned, cached and replaceable; user data is private, migrated and exportable.
5. **No unofficial game access.** The only sources of player data are manual entry, screenshots the user picks, and files the user imports.

## Layers

```
 src/app            Expo Router screens (thin) ─┐
 src/features       screen-level logic/hooks    │  UI layer (React Native)
 src/components     ui/, pokemon/, charts/      │
 src/store          Zustand stores              ─┘
 src/services       database, reference, api, ocr, notifications, sync, ai   ← I/O boundary
 src/engine         PURE TypeScript (no RN/Expo imports)                      ← domain / maths
 src/data           bundled reference snapshot
```

Dependency rule: `engine` imports nothing from the other layers; `services` may import `engine`; UI imports both. This is what lets the whole engine run under Jest in plain Node.

### Engine (`src/engine`)

| Module | Responsibility |
|---|---|
| `types.ts` | Domain types (`GoSpecies`, `OwnedPokemon`, `IVs`, leagues…) |
| `reference/` | Zod schemas for each provider dataset, `ReferenceData` index (species/forms/families, moves, evolutions, power‑up steps, megas, raid bosses, PvPoke meta) |
| `combat/` | CP/HP maths, CPM table (with extrapolation), IV/level inference, `Knowledge` model, type chart |
| `powerup/`, `evolution/` | Costs, affordability, evolution paths and requirements |
| `pvp/` | Stat‑product ranking, league assessment, 1v1 simulator, team analysis/suggestion |
| `raids/` | PvE damage model, boss profiles, moveset ranking, counter/team builder |
| `recommendations/` | Role ratings, per‑Pokémon `analyzePokemon`, account‑wide `analyzeCollection`, budget plans |
| `search/` | Parser/evaluator for the GO‑style search subset |
| `io/` | CSV/JSON import & export, backup schema/validation, import deduplication, OCR text extraction |

All provider data is parsed with Zod at the boundary; the rest of the engine only sees validated, normalised structures.

### Services (`src/services`)

- **`database/`** – `expo-sqlite` (async API). `schema.ts` holds versioned migrations applied transactionally via `PRAGMA user_version`; `repositories.ts` are the only code that writes SQL. Tests run the same repositories on Node's built‑in `node:sqlite` through an adapter.
- **`reference/referenceService.ts`** – bundled snapshot → cached last‑known‑good → hash‑compare update with validation and sanity gating (see DATA_SOURCES.md).
- **`api/`** – `fetchJson`/`fetchWithRetry` (timeout, retry, backoff, schema validation) and the PokéAPI client (species info/artwork).
- **`ocr/`** – ML Kit wrapper loaded dynamically; unavailable in Expo Go/web (callers get `OcrUnavailableError`).
- **`notifications/`** – local notifications only, derived from the user's own plan/goals/milestones.
- **`sync/`** – file export/import via the system share sheet and document picker.
- **`ai/`** – coach client, protocol/schemas, vision, Supabase client, optional cloud backup.

### State (`src/store`)

Zustand stores: `settings` (persisted preferences), `data` (user collection/resources/teams/plan, loaded from SQLite, bumps a `version` on mutation), `reference` (the active `ReferenceData` + refresh status/`revision`), `analysis` (account analysis results), `collectionView` (filters/sort), `importQueue`, `onboarding`. TanStack Query is used for network reads (species info) with an offline‑first network mode.

### Recommendation pipeline

```
 OwnedPokemon ──► Knowledge (exact | level‑ambiguous | iv‑range | unknown | inconsistent)
        │
        ├─► role ratings (now / potential / range / basis) per role  ◄─ ReferenceData, PvPoke meta
        ├─► costs (power‑up, evolution) vs ResourceView (unknown balances stay unknown)
        ├─► peer index (what else you own in the same role → redundancy)
        └─► goal weights ──► verdict + evidence[] + confidence + dataset version
 analyzeCollection(): async, cooperative (yields to the UI), reuses peer ratings; AnalysisRunner debounces
 re‑runs on collection / resource / goal / dataset changes.
```

On a ~400‑Pokémon collection the full analysis takes a few seconds on a laptop‑class Node process (performance test budget: <40 s; measured ≈ 6.5 s). Mobile Hermes devices are slower; the analysis is chunked so the UI stays responsive, but this has not been measured on real phones.

## Database design

Reference data and user data are kept apart.

- **User data:** `trainer_profile`, `owned_pokemon` (many rows per species; `source`/provenance, `import_batch_id`, soft delete via `deleted_at`, unknown IV columns are NULL — never 0), `tag` / `pokemon_tag`, `resource_balance` (nullable amount = unknown), `saved_team` / `saved_team_member`, `investment_action` (plan), `recommendation` (cached analysis), `import_batch`, `chat_conversation` / `chat_message`, `app_kv`.
- **Reference/cache:** `reference_version`, `reference_cache` (validated dataset JSON per provider file), `species_info_cache` (PokéAPI).
- Reset erases user data and caches; export/backup is a versioned JSON (`engine/io/backup.ts`) validated on restore with `merge` or `replace` modes and per‑Pokémon de‑duplication.

## AI architecture

```
 Expo app ── supabase-js (anonymous auth, JWT) ──► Edge Function `gemini-coach` ──► Gemini API
   ▲                                                  • verifies JWT, validates/size‑limits request
   │ tool calls (names + args)                        • per‑user hourly/daily quota (consume_ai_quota, RLS)
   │                                                  • builds Gemini request: system prompt, tool declarations,
   └── executes tools LOCALLY on the device           │   responseSchema for "format"/"vision" modes
       (get_account_summary, list_pokemon,            • holds GEMINI_API_KEY (secret) — never in the app
        get_pokemon_analysis, get_top_priorities,
        plan_budget, build_raid_team,
        get_pvp_candidates, compare_pokemon,
        get_species_info, find_pvp_only_pokemon)
```

- **The model has no database access.** It can only request the fixed read‑only tools listed in `supabase/functions/_shared/tools.json`; the app runs them on the deterministic engine and returns capped results (`capResponse`, ≤ 9 000 chars). Maximum 6 tool rounds and 8 history turns per question.
- **Structured output.** After tool use, a final "format" call constrains Gemini to a JSON schema; the client re‑validates it with Zod (`coachReplySchema`) and sanitises it. Invalid output → error state, not a fabricated answer.
- **Rate limiting.** Anonymous Supabase auth gives each install a stable user id; `consume_ai_quota` (SQL, advisory‑locked per user) enforces `AI_HOURLY_LIMIT` (default 20) and `AI_DAILY_LIMIT` (default 120) and returns `retry_after`. Client adds a 1.5 s minimum interval.
- **Vision.** Screenshots go to Gemini only after explicit opt‑in; the response is a schema‑validated draft that always lands in the same editable review screen as OCR.
- **Fallback.** With no config, no network, quota exhausted or an error, `features/assistant/localAnswer.ts` answers from the same tools locally (top priorities, account summary, comparisons…) and the UI states that the cloud AI is unavailable and why. There is no canned fake chatbot.
- **Privacy.** Only the data returned by the tools the model asked for (compact, per‑question) is sent. Chats are stored locally; "Reset" erases them.

## Navigation & UI

Expo Router (file‑based, `src/app`): five tabs — Home, Collection, Advisor, Battle, Profile — rendered by a custom dock built on `expo-router/js-tabs`; stack/modals for detail, add, filters, assistant, raids, PvP, Pokédex, import, settings. The "Midnight Orbit" design system (tokens in `src/theme`, primitives in `src/components/ui`) follows the Stitch wireframes in `../stitch_go_compass_companion_app`. Light theme, reduced‑motion handling (Reanimated), 44 pt targets, EN/ES via `src/i18n`.

## Testing strategy

| Level | Tools | Coverage |
|---|---|---|
| Engine unit | Jest | CP/IV/level, power‑up totals, evolution, mechanics, PvP ranking, battle sim, raid model |
| Scenario | Jest | Recommendations: empty collection, insufficient resources, unknown IVs, redundancy, goals |
| Data / IO | Jest + `node:sqlite` | Reference validation & update fallback, CSV/JSON import, backup/restore/dedupe, repositories, migrations |
| Assistant | Jest | Tool contracts and offline answers |
| Components | RNTL | Core UI components |
| Performance | Jest | 1 500‑item filter/sort, 400‑Pokémon analysis budgets |
| E2E | Maestro (`.maestro/`) | Onboarding‑with‑demo and add‑Pokémon flows (need a running build) |

## Key decisions and trade‑offs

- **Client‑executed tools** instead of server‑side DB access: keeps user data on device and the Edge Function stateless; costs an extra round trip per tool batch.
- **Bundled snapshot + cached last‑known‑good**: guarantees first‑run offline use; costs ≈ 1.5 MB of JSON in the app and requires periodic `npm run snapshot:reference` for releases.
- **Percentile‑based tiers**: avoids hard‑coding "meta" lists that go stale; they are relative to the species pool and documented as app‑specific.
- **Typed routes and React Compiler are switched off** in `app.json`; routes are plain strings, so a mistyped path is caught by tests/smoke runs rather than the compiler.
