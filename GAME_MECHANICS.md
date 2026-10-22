# Game mechanics, models and known approximations

All code lives in `src/engine` (pure TypeScript, no React Native imports) and is covered by the Jest suites in `tests/`. This document separates three kinds of statements so nothing is presented with false authority:

- **Game formulas** – public, well‑established mechanics (CP, HP, stat product…), implemented exactly.
- **Provider data** – values read from PoGoAPI / PvPoke (see DATA_SOURCES.md).
- **Model constants / heuristics** – choices made by this app, explicitly labelled "estimate" in the UI.

## 1. Combat power and stats (`combat/cp.ts`) — game formulas

```
CP = floor( max(10, (baseAtk+ivAtk) · √(baseDef+ivDef) · √(baseSta+ivSta) · CPM² / 10) )
HP = floor( max(10, (baseSta+ivSta) · CPM) )
effective Atk/Def = (base+iv) · CPM            (not floored)
IV % = (atk+def+sta) / 45
```

- Levels run 1–50 in half‑level steps; level 51 exists for Best Buddy. Trainer cap = min(50, trainerLevel + 2) (+1 with Best Buddy).
- **CPM above level 45** is not in provider data. The table extrapolates +0.0025 per half level (level 50 = 0.8403). A test cross‑checks this against provider max‑CP figures at level 51 (`tests/fixtures/maxcp.json`).
- **Appraisal stars**: 4★ = 45/45, 3★ ≥ 37, 2★ ≥ 30, 1★ ≥ 23, else 0★.
- IV % measures stat sum only. It is **never** used alone to judge usefulness.

### Level and IV inference — never invents precision

`estimateLevel` / `solveIvCandidates` enumerate every (IV, level) pair consistent with the observed CP (and HP). The result is one of `known`, `unique`, `ambiguous` (several levels fit), `impossible` (likely typo) or `insufficient`. The UI shows ranges and asks for HP / appraisal when that would narrow the answer. The recommendation engine carries a **Knowledge** state (`exact`, `level‑ambiguous`, `iv‑range`, `unknown`, `inconsistent`) and rates against the *range*, widening the confidence band instead of assuming 15/15/15 or 0/0/0.

## 2. Power‑up and evolution (`powerup/`, `evolution/`)

- Stardust / candy / XL candy per half‑level step come from `pokemon_powerup_requirements`; totals are summed per step.
- **Modifiers (approximation):** shadow +20 % Stardust & candy; purified −10 %; lucky −50 % Stardust (candy unchanged). Applied **per step then rounded**, which is how the game charges each power‑up. If Niantic changes these rates, `stepModifiers` in `powerup/powerUp.ts` is the single place to update.
- If a level has no cost entry the result is flagged `incomplete` rather than silently undercounted.
- Evolution costs/requirements (candy, items, buddy distance, special conditions) come from `pokemon_evolutions`; the advisor reports conditions the app cannot check (e.g. trade, location) as "needs verification".

## 3. PvP (`pvp/`)

- League caps: Little 500, Great 1500, Ultra 2500, Master 10000 (Master uncapped by CP, limited by level cap).
- **Stat product** = Atk × Def × floor(HP) at the highest level whose CP ≤ cap. All 4 096 IV combinations are ranked per species/league (`computeIvRanking`, a tight numeric loop). Rank 1 = highest stat product. Ties share a rank.
- **Meta score** comes from PvPoke rankings when the species is ranked; otherwise a transparent estimate (`estimateMetaScore`) from base stats and typing, labelled as an estimate.
- **Suitability** (0–100): `metaScore × (1 − 1.5 × (1 − productRatio))`, where `productRatio` = your stat product ÷ best possible. Interpretation: a 10 % lower stat product costs ≈ 15 % suitability. When IVs/level are unknown the score is a range midpoint and flagged.
- **PvP tier cuts:** S ≥ 88, A ≥ 78, B ≥ 62, C ≥ 45, else D.
- **1v1 simulator** (`pvp/battle.ts`) is a deterministic 0.5 s‑turn model: fast‑move timing, energy, charged moves, shields, 100 %‑chance move buffs and stat stages, charged‑move priority by Attack, STAB/effectiveness, shadow modifiers and simple bait/shield heuristics. **Not modelled:** probabilistic buffs (<100 %), switching, optimal bait play, fast‑move timing tricks. It is used for team‑threat analysis and relative comparisons, not as a tournament‑grade simulator.

## 4. Raids and gyms (`raids/`)

Damage per hit (PvE):

```
damage = floor( 0.5 · power · (Atk / Def) · STAB · effectiveness · weather · friendship · mega ) + 1
```

Model constants (all in `raids/raidModel.ts`; **not provider data**):

| Constant | Value | Notes |
|---|---|---|
| STAB | ×1.2 | |
| Weather boost | ×1.2 | moves of boosted types per `weather_boosts` |
| Friendship bonus | from `friendship_level_settings` | |
| Mega boost | ×1.1 general, ×1.3 same type | |
| Shadow | Atk ×1.2, Def ×5/6 | |
| Boss move delay | 2 000 ms | approximates the boss's gap between moves |
| Boss IVs | 15/15/15 | boss stats = (base+15) · CPM(level) |
| Boss HP / level / time limit | T1 600/L20/180 s · T2 1 800/L25 · T3 3 600/L30 · T4 9 000/L40 · T5 & T6 15 000/L40/300 s · Mega 9 000/L40/300 s · Mega Legendary 22 500 · EX 15 000 | Update in `BOSS_TIERS` if the game changes |

**Raid score** = `(DPS³ · TDO)^¼`, where DPS is the fractional move‑cycle DPS (charged move thrown whenever enough energy accrues) and TDO = DPS × estimated survival time against the boss's average move pair. Ignored: dodging, energy gained from damage taken, lobby/party effects, random move ordering, buff/debuff moves. It ranks your Pokémon *relative to each other* — "this is the best you own" — and is **not** a victory guarantee or a time‑to‑kill promise. The UI labels team results as estimates and shows the assumptions used.

**Team builder** takes the six highest raid scores among your *owned* Pokémon (default max two per species), skipping Pokémon whose IVs/level are too unknown to evaluate (they are listed as "needs data"). It then reports **coverage gaps** — boss weaknesses none of the six hits super‑effectively — and a team estimate: members' DPS is summed over their survival times (best first, capped by the tier's time limit) to give a fraction of boss HP and "trainers needed". It never puts Pokémon you do not own in the team.

## 5. Ratings and verdicts (`recommendations/`)

- **Role ratings** (raid, gym attack, gym defence, Great/Ultra/Master) express a Pokémon as a **percentile within the released species pool** (raid/gym) or as PvP suitability. Each rating has `now` and `potential` (at the role's target level, e.g. raid L40 / league level / L50) plus a `potentialRange` when knowledge is incomplete and a `basis` (`simulation` · `provider` · `estimate`).
- **Percentile tier cuts:** S ≥ 98, A ≥ 94, B ≥ 80, C ≥ 55, else D. These are *this app's* cut‑offs, not game or community official tiers.
- **Goal weights** (from onboarding/profile) scale each role: with no goals set, all roles are weighted neutrally‑high; chosen goals add up to +0.45 × weight to the matching roles.
- **Cost‑aware role choice:** when choosing which role to develop a Pokémon for, a Stardust penalty of up to 20 points (≈ 300 k Stardust) prefers a nearly‑as‑good, cheaper role. Efficiency = impact ÷ (1 + stardust/50 000).
- **Diminishing returns:** raid gains are expressed as relative raw‑score gain, not percentile points, so powering up an already‑top attacker does not look artificially useful.
- **Redundancy:** when better owned Pokémon already fill the same role, verdicts say so (`betterOwned`) and push toward `KEEP`/`DONT_INVEST`/`CONSIDER_TRANSFER` rather than recommending another expensive build.
- **Affordability** uses *your entered* resources. Unknown balance → the engine says "enter your Stardust to check affordability" instead of assuming enough or not enough.
- Verdict set: `POWER_UP`, `EVOLVE`, `KEEP`, `SAVE_FOR_PVP`, `CHANGE_MOVES`, `WAIT_FOR_EVENT`, `DONT_INVEST`, `CONSIDER_TRANSFER`, `MORE_INFO`. `CONSIDER_TRANSFER` is only suggested with reasons, and the app never deletes a Pokémon itself.
- Every verdict carries `evidence[]`, a `confidence`, and the reference dataset version. The same inputs always give the same output (deterministic; no randomness, no network).

## 6. Known limits (please read)

1. Provider data may lag game updates; ratings inherit that lag.
2. The raid model is analytical, not a simulator; real raids vary with dodging, lobby size and boss move order.
3. PvP simulator is simplified; meta rankings are PvPoke's, not computed here.
4. Shadow/purified/lucky cost multipliers and raid‑tier boss constants are documented approximations.
5. Tier cut‑offs and goal weights are design decisions, tunable in `ratings.ts`.
6. Special evolution conditions, regional availability, and time‑limited events are not tracked unless they appear in provider data. The app never claims to know what is available "right now".
