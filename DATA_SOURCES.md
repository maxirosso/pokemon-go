# Data sources

GO Compass never fabricates game data. Every number the engine uses comes from one of the sources below, is validated with Zod before use, and carries a version/hash so the UI can show how fresh it is. Where the app needs a constant that no provider supplies (e.g. raid boss HP per tier) it is a **named model constant** documented in [GAME_MECHANICS.md](GAME_MECHANICS.md) — not presented as provider data.

## Providers

| Provider | Used for | NOT used for | Access |
|---|---|---|---|
| **PoGoAPI** (pogoapi.net, community‑maintained) | Pokémon GO base stats, types, fast/charged moves (PvE and PvP values), movesets, CP multipliers, evolutions, power‑up requirements, mega, shadow, shiny, raid bosses, weather boosts, type effectiveness, buddy distances, rarity, generations | Anything account‑related | Public JSON, no key. `api_hashes.json` is polled to detect changes |
| **PvPoke** (pvpoke.com rankings) | Meta rankings per league (Little 500, Great 1500, Ultra 2500, Master 10000), recommended movesets | Computing IV spreads (done locally) | Public JSON from the PvPoke GitHub repository |
| **PokéAPI** (pokeapi.co) | **Species names/Pokédex flavour, artwork and sprites only** | Gameplay stats (its *main‑series* stats differ from Pokémon GO's) | Public REST, cached on first view |
| **Google Gemini** (optional) | AI coach text + screenshot extraction, through *your* Supabase Edge Function | Authoritative game data — the model must call app tools; the app validates every answer against a schema | Needs your own key; see DEVELOPMENT.md |

PoGoAPI and PvPoke are community projects, not official Niantic sources, and can lag behind game updates or contain errors. The app shows the dataset version and the time it was last checked (Settings → Data sources), and the recommendation evidence panel lists the dataset version that produced each verdict.

## Bundled snapshot (`src/data/reference/`)

`npm run snapshot:reference` (`scripts/build-reference-snapshot.mjs`) downloads **22 PoGoAPI datasets + 4 PvPoke rankings**, minifies them and writes a `manifest.json` containing each file's SHA‑256 and the generation time. The snapshot is imported by `src/data/bundledReference.ts`, so the app has complete data on first launch with no network.

## Runtime update flow (`src/services/reference/referenceService.ts`)

1. On start the app loads the **last‑known‑good** copy from SQLite (`reference_cache`), falling back to the bundled snapshot.
2. At most once per 24 h (or on manual manual refresh) it fetches `api_hashes.json` from PoGoAPI and compares hashes with the cached ones.
3. Changed datasets are downloaded with timeout + retry/backoff, parsed with the Zod schema of that dataset, and **sanity‑gated**: the normalised index is rebuilt and the bundle is rejected if it lists fewer than 90 % of the species already in use. Requests time out (15 s hashes, 30 s datasets, 45 s PvPoke rankings) and retry with backoff.
4. If every changed dataset passes, they are written to the cache in one transaction and the in‑memory `ReferenceData` is rebuilt; recommendations are recomputed.
5. If anything fails (offline, 5xx, schema change, sanity gate) the previous data stays active. The Data sources screen shows the failure and the age of the data in use. No partial updates are ever applied.

PokéAPI responses are cached in `species_info_cache`; artwork is cached by `expo-image`.

## Known data limitations

- **Level 46–51 CP multipliers.** Providers currently list CPM up to level 45. The engine extrapolates +0.0025 per half level (matches in‑game CPM; verified against provider max‑CP figures at level 51) and flags extrapolated levels.
- **Move pools** come from `current_pokemon_moves` (currently obtainable moves). Legacy / event‑only moves are not assumed.
- **PvPoke rankings** describe the *meta*; unreleased or newly released species may be absent, in which case the app uses a transparent estimate and labels it as an estimate.
- **Form handling** (regional, mega, costume) follows PoGoAPI's form naming; unusual forms may fall back to the base species data.
- **Raid boss lists** change weekly; the app's raid screen lets you pick any boss from the dataset, so it is only as current as the last refresh. It does not claim to show the "current rotation".

## Licensing & trademark notes (read before publishing to a store)

- Data licences differ and this is **not legal advice**: PvPoke is MIT‑licensed; PoGoAPI is a community project with no clearly stated licence (check its terms before commercial use or redistribution of the bundled snapshot); PokéAPI data needs attribution while its artwork/sprites belong to the rights holders. The in‑app About screen credits all three.
- Pokémon names, artwork and the Pokémon GO name are trademarks / copyrights of their owners. The app displays PokéAPI‑hosted artwork for identification only and does not bundle artwork. App name, icon and store listing must not imply an official relationship.
- If you commercialise the app, get a proper IP review and consider replacing artwork with your own assets.

## What the app does *not* use

No official Pokémon GO API exists. The app does not use any unofficial game authentication, private endpoints, intercepted traffic, scraped player data, or location services. Player data is whatever the user enters or imports.
