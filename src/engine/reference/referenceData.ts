import { CpmTable } from '../combat/cp';
import type { TypeChart } from '../combat/typeChart';
import {
  POKEMON_TYPES,
  type ChargedMove,
  type EvolutionEdge,
  type FastMove,
  type GoSpecies,
  type LeagueId,
  type MegaForm,
  type MovePool,
  type PokemonType,
  type PowerUpStep,
  type RaidBoss,
  type Rarity,
} from '../types';
import type { PvpokeBundle, RawReferenceBundle } from './schemas';

export interface ReferenceMeta {
  source: 'bundled' | 'cache' | 'network';
  fetchedAt: string;
  /** dataset → provider hash/version (when the provider supplies one). */
  versions: Record<string, string | null>;
}

export interface PvpMetaEntry {
  league: LeagueId;
  /** 1-based position in the provider's ranking list for that league. */
  rank: number;
  total: number;
  /** Provider score, 0–100. */
  score: number;
  moveset: string[];
  statProduct: number | null;
  speciesName: string;
}

const TYPE_SET = new Set<string>(POKEMON_TYPES);
const asType = (t: string): PokemonType => {
  if (!TYPE_SET.has(t)) throw new Error(`Unknown Pokémon type "${t}"`);
  return t as PokemonType;
};
const asTypes = (ts: readonly string[]): PokemonType[] => ts.filter((t) => TYPE_SET.has(t)).map(asType);

export const speciesKey = (speciesId: number, form: string): string => `${speciesId}:${form}`;

export function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/♀/g, 'f')
    .replace(/♂/g, 'm')
    .replace(/[^a-z0-9]/g, '');
}

const FORM_LABELS: Record<string, string> = {
  Normal: '',
  Alola: 'Alolan',
  Galarian: 'Galarian',
  Hisuian: 'Hisuian',
  Paldea: 'Paldean',
  A: 'Armored',
};

export function formLabel(form: string): string {
  if (form in FORM_LABELS) return FORM_LABELS[form];
  return form.replace(/_/g, ' ');
}

export function speciesDisplayName(s: Pick<GoSpecies, 'name' | 'form'>): string {
  const label = formLabel(s.form);
  return label ? `${label} ${s.name}` : s.name;
}

const LEAGUE_BY_CAP: Record<string, LeagueId> = { '500': 'little', '1500': 'great', '2500': 'ultra', '10000': 'master' };

/**
 * Normalised, indexed view over the raw provider datasets. Built once per dataset version
 * (see ReferenceDataService) and shared by every engine module. All lookups are O(1).
 */
export class ReferenceData {
  readonly meta: ReferenceMeta;
  readonly cpm: CpmTable;
  readonly typeChart: TypeChart;
  readonly weatherBoosts: Record<string, PokemonType[]>;
  readonly raidBosses: RaidBoss[];

  private readonly speciesByKey = new Map<string, GoSpecies>();
  private readonly speciesById = new Map<number, GoSpecies[]>();
  private readonly nameIndex = new Map<string, number>();
  private readonly fastMoves = new Map<string, FastMove>();
  private readonly chargedMoves = new Map<string, ChargedMove>();
  private readonly pools = new Map<string, MovePool>();
  private readonly outEdges = new Map<string, EvolutionEdge[]>();
  private readonly inEdges = new Map<string, EvolutionEdge[]>();
  private readonly powerUps = new Map<number, PowerUpStep>();
  private readonly megas = new Map<number, MegaForm[]>();
  private readonly pvpMeta = new Map<string, PvpMetaEntry>(); // `${league}|${key}|${shadow?1:0}`
  private readonly pvpTotals = new Map<LeagueId, number>();
  private readonly families = new Map<number, number[]>();
  private readonly buddyKm = new Map<number, number>();
  readonly friendshipAttackBonus: Record<string, number> = {};

  constructor(raw: RawReferenceBundle, pvpoke: PvpokeBundle, meta: ReferenceMeta) {
    this.meta = meta;
    this.cpm = new CpmTable(raw.cp_multiplier);
    this.typeChart = raw.type_effectiveness;
    this.weatherBoosts = Object.fromEntries(
      Object.entries(raw.weather_boosts).map(([w, ts]) => [w, asTypes(ts)]),
    );

    this.indexMoves(raw);
    this.indexPowerUps(raw);
    this.indexSpecies(raw);
    this.indexEvolutions(raw);
    this.computeFamilies();
    this.indexMegas(raw);
    this.raidBosses = this.buildRaidBosses(raw);
    this.indexPvpMeta(pvpoke);
    for (const [km, rows] of Object.entries(raw.pokemon_buddy_distances)) {
      for (const r of rows) if (r.form === 'Normal') this.buddyKm.set(r.pokemon_id, Number(km));
    }
    for (const f of raw.friendship_level_settings) this.friendshipAttackBonus[f.name] = f.attack_bonus;
  }

  // ---- species -----------------------------------------------------------------------------

  getSpecies(speciesId: number, form = 'Normal'): GoSpecies | undefined {
    return (
      this.speciesByKey.get(speciesKey(speciesId, form)) ?? this.speciesByKey.get(speciesKey(speciesId, 'Normal'))
    );
  }

  getByKey(key: string): GoSpecies | undefined {
    return this.speciesByKey.get(key);
  }

  formsOf(speciesId: number): GoSpecies[] {
    return this.speciesById.get(speciesId) ?? [];
  }

  /** One entry per user-selectable species/form (released only), ordered by Pokédex number. */
  listSpecies(opts: { includeUnreleased?: boolean } = {}): GoSpecies[] {
    const out: GoSpecies[] = [];
    for (const list of this.speciesById.values())
      for (const s of list) if (s.released || opts.includeUnreleased) out.push(s);
    return out.sort((a, b) => a.speciesId - b.speciesId || (a.form === 'Normal' ? -1 : 1));
  }

  /** Find the species id for a (possibly messy) name, e.g. from OCR or CSV import. */
  findSpeciesIdByName(name: string): number | undefined {
    return this.nameIndex.get(normalizeName(name));
  }

  buddyDistanceKm(speciesId: number): number | undefined {
    return this.buddyKm.get(speciesId);
  }

  // ---- moves -------------------------------------------------------------------------------

  fastMove(name: string): FastMove | undefined {
    return this.fastMoves.get(name);
  }
  chargedMove(name: string): ChargedMove | undefined {
    return this.chargedMoves.get(name);
  }
  allFastMoves(): FastMove[] {
    return [...this.fastMoves.values()];
  }
  allChargedMoves(): ChargedMove[] {
    return [...this.chargedMoves.values()];
  }
  movePool(speciesId: number, form = 'Normal'): MovePool | undefined {
    return this.pools.get(speciesKey(speciesId, form)) ?? this.pools.get(speciesKey(speciesId, 'Normal'));
  }

  // ---- evolution ---------------------------------------------------------------------------

  evolutionsFrom(key: string): EvolutionEdge[] {
    return this.outEdges.get(key) ?? [];
  }
  evolvesFrom(key: string): EvolutionEdge[] {
    return this.inEdges.get(key) ?? [];
  }
  familyMembers(familyId: number): GoSpecies[] {
    return (this.families.get(familyId) ?? []).flatMap((id) => this.speciesById.get(id) ?? []);
  }

  /** Every species reachable by evolving from `key` (depth-first, no duplicates). */
  descendantsOf(key: string): GoSpecies[] {
    const seen = new Set<string>();
    const out: GoSpecies[] = [];
    const walk = (k: string) => {
      for (const e of this.evolutionsFrom(k)) {
        if (seen.has(e.toKey)) continue;
        seen.add(e.toKey);
        const s = this.speciesByKey.get(e.toKey);
        if (s) out.push(s);
        walk(e.toKey);
      }
    };
    walk(key);
    return out;
  }

  // ---- power-up ----------------------------------------------------------------------------

  powerUpStep(level: number): PowerUpStep | undefined {
    return this.powerUps.get(level);
  }
  get maxPowerUpTableLevel(): number {
    let max = 0;
    for (const s of this.powerUps.values()) max = Math.max(max, s.nextLevel);
    return max;
  }

  // ---- mega --------------------------------------------------------------------------------

  megaFormsOf(speciesId: number): MegaForm[] {
    return this.megas.get(speciesId) ?? [];
  }

  // ---- pvp meta ----------------------------------------------------------------------------

  /** Provider (PvPoke) ranking info for a species in a league, if the provider ranks it. */
  getPvpMeta(league: LeagueId, speciesId: number, form: string, shadow: boolean): PvpMetaEntry | null {
    const key = speciesKey(speciesId, form);
    return (
      (shadow ? this.pvpMeta.get(`${league}|${key}|1`) : undefined) ?? this.pvpMeta.get(`${league}|${key}|0`) ?? null
    );
  }

  hasPvpMeta(): boolean {
    return this.pvpMeta.size > 0;
  }

  pvpMetaTotal(league: LeagueId): number {
    return this.pvpTotals.get(league) ?? 0;
  }

  /** Top-N ranked entries for a league (non-shadow & shadow, provider order). */
  topPvpMeta(league: LeagueId, n: number): (PvpMetaEntry & { speciesId: number; form: string; shadow: boolean })[] {
    const out: (PvpMetaEntry & { speciesId: number; form: string; shadow: boolean })[] = [];
    for (const [k, v] of this.pvpMeta) {
      if (!k.startsWith(`${league}|`)) continue;
      const [, key, sh] = k.split('|');
      const [id, form] = key.split(':');
      out.push({ ...v, speciesId: Number(id), form, shadow: sh === '1' });
    }
    return out.sort((a, b) => a.rank - b.rank).slice(0, n);
  }

  // ---- builders ----------------------------------------------------------------------------

  private indexMoves(raw: RawReferenceBundle) {
    const pvpFast = new Map(raw.pvp_fast_moves.map((m) => [m.name, m]));
    for (const m of raw.fast_moves) {
      const pvp = pvpFast.get(m.name);
      this.fastMoves.set(m.name, {
        id: m.move_id,
        name: m.name,
        type: asType(m.type),
        power: m.power,
        energy: m.energy_delta,
        durationMs: m.duration,
        pvpPower: pvp?.power ?? 0,
        pvpEnergy: pvp?.energy_delta ?? 0,
        pvpTurns: pvp?.turn_duration ?? 1,
      });
    }
    const pvpCharged = new Map(raw.pvp_charged_moves.map((m) => [m.name, m]));
    for (const m of raw.charged_moves) {
      const pvp = pvpCharged.get(m.name);
      const b = pvp?.buffs;
      this.chargedMoves.set(m.name, {
        id: m.move_id,
        name: m.name,
        type: asType(m.type),
        power: m.power,
        energy: Math.abs(m.energy_delta),
        durationMs: m.duration,
        critChance: m.critical_chance ?? 0,
        pvpPower: pvp?.power ?? 0,
        pvpEnergy: pvp ? Math.abs(pvp.energy_delta) : 0,
        buffs: b
          ? {
              activationChance: b.activation_chance,
              selfAtk: b.attacker_attack_stat_stage_change,
              selfDef: b.attacker_defense_stat_stage_change,
              targetAtk: b.target_attack_stat_stage_change,
              targetDef: b.target_defense_stat_stage_change,
            }
          : null,
      });
    }
    for (const p of raw.current_pokemon_moves) {
      this.pools.set(speciesKey(p.pokemon_id, p.form), {
        fast: p.fast_moves,
        charged: p.charged_moves,
        eliteFast: p.elite_fast_moves,
        eliteCharged: p.elite_charged_moves,
      });
    }
  }

  private indexPowerUps(raw: RawReferenceBundle) {
    for (const r of Object.values(raw.pokemon_powerup_requirements)) {
      this.powerUps.set(r.current_level, {
        level: r.current_level,
        nextLevel: r.level_after_powering,
        stardust: r.stardust_to_upgrade,
        candy: r.candy_to_upgrade,
        xlCandy: r.xl_candy_to_upgrade,
      });
    }
  }

  private indexSpecies(raw: RawReferenceBundle) {
    const released = new Set(Object.values(raw.released_pokemon).map((r) => r.id));
    const shadows = new Set(Object.values(raw.shadow_pokemon).map((r) => r.id));
    const shinies = new Set(Object.keys(raw.shiny_pokemon).map(Number));
    const babies = new Set(raw.baby_pokemon.map((b) => b.id));
    const generation = new Map<number, number>();
    for (const rows of Object.values(raw.pokemon_generations))
      for (const r of rows) generation.set(r.id, r.generation_number);

    const rarity = new Map<number, Rarity>();
    for (const [label, rows] of Object.entries(raw.pokemon_rarity)) {
      const r: Rarity | null =
        label === 'Legendary' ? 'legendary' : label === 'Mythic' ? 'mythical' : label === 'Ultra beast' ? 'ultra-beast' : null;
      if (!r) continue;
      for (const row of rows) rarity.set(row.pokemon_id, r);
    }

    const typeRows = new Map<string, PokemonType[]>();
    for (const t of raw.pokemon_types) typeRows.set(speciesKey(t.pokemon_id, t.form), asTypes(t.type));

    const statRows = new Map<string, (typeof raw.pokemon_stats)[number]>();
    for (const s of raw.pokemon_stats) statRows.set(speciesKey(s.pokemon_id, s.form), s);

    const sameTypes = (a: PokemonType[], b: PokemonType[]) => a.length === b.length && a.every((t, i) => t === b[i]);

    for (const row of raw.pokemon_stats) {
      const key = speciesKey(row.pokemon_id, row.form);
      const normal = statRows.get(speciesKey(row.pokemon_id, 'Normal'));
      const types = typeRows.get(key) ?? typeRows.get(speciesKey(row.pokemon_id, 'Normal')) ?? [];
      if (row.form !== 'Normal') {
        // Keep only forms that matter for gameplay (different stats or typing); costume/cosmetic forms collapse to Normal.
        const nTypes = typeRows.get(speciesKey(row.pokemon_id, 'Normal')) ?? [];
        const statsDiffer =
          !normal ||
          normal.base_attack !== row.base_attack ||
          normal.base_defense !== row.base_defense ||
          normal.base_stamina !== row.base_stamina;
        if (!statsDiffer && sameTypes(types, nTypes)) continue;
      }
      const s: GoSpecies = {
        key,
        speciesId: row.pokemon_id,
        name: row.pokemon_name,
        form: row.form,
        stats: { atk: row.base_attack, def: row.base_defense, sta: row.base_stamina },
        types,
        generation: generation.get(row.pokemon_id) ?? 0,
        rarity: rarity.get(row.pokemon_id) ?? 'standard',
        isBaby: babies.has(row.pokemon_id),
        shadowAvailable: shadows.has(row.pokemon_id),
        shinyAvailable: shinies.has(row.pokemon_id),
        released: released.has(row.pokemon_id),
        familyId: row.pokemon_id,
        stage: 0,
        isFinalStage: true,
      };
      this.speciesByKey.set(key, s);
      const list = this.speciesById.get(row.pokemon_id) ?? [];
      list.push(s);
      this.speciesById.set(row.pokemon_id, list);
      const norm = normalizeName(row.pokemon_name);
      if (!this.nameIndex.has(norm)) this.nameIndex.set(norm, row.pokemon_id);
    }
  }

  /** Resolve an evolution reference (id + provider form) to a key that exists in our species index. */
  private resolveKey(speciesId: number, form: string): string | null {
    const exact = speciesKey(speciesId, form);
    if (this.speciesByKey.has(exact)) return exact;
    const normal = speciesKey(speciesId, 'Normal');
    return this.speciesByKey.has(normal) ? normal : null;
  }

  private indexEvolutions(raw: RawReferenceBundle) {
    const seen = new Set<string>();
    for (const row of raw.pokemon_evolutions) {
      const fromKey = this.resolveKey(row.pokemon_id, row.form);
      if (!fromKey) continue;
      for (const e of row.evolutions) {
        const toKey = this.resolveKey(e.pokemon_id, e.form);
        if (!toKey) continue;
        const dedupe = `${fromKey}>${toKey}`;
        if (seen.has(dedupe)) continue;
        seen.add(dedupe);
        const edge: EvolutionEdge = {
          fromKey,
          toKey,
          candy: e.candy_required,
          item: e.item_required,
          lure: e.lure_required,
          buddyDistanceKm: e.buddy_distance_required,
          mustBeBuddy: e.must_be_buddy_to_evolve,
          daytimeOnly: e.only_evolves_in_daytime,
          nighttimeOnly: e.only_evolves_in_nighttime,
          noCandyIfTraded: e.no_candy_cost_if_traded,
          genderRequired: e.gender_required,
          upsideDown: e.upside_down,
          priority: e.priority,
        };
        const out = this.outEdges.get(fromKey) ?? [];
        out.push(edge);
        this.outEdges.set(fromKey, out);
        const inn = this.inEdges.get(toKey) ?? [];
        inn.push(edge);
        this.inEdges.set(toKey, inn);
      }
    }
  }

  private computeFamilies() {
    // species-level union-find for candy families
    const parent = new Map<number, number>();
    const find = (x: number): number => {
      let r = x;
      while ((parent.get(r) ?? r) !== r) r = parent.get(r) ?? r;
      parent.set(x, r);
      return r;
    };
    const union = (a: number, b: number) => {
      const ra = find(a);
      const rb = find(b);
      if (ra === rb) return;
      parent.set(Math.max(ra, rb), Math.min(ra, rb));
    };
    for (const edges of this.outEdges.values()) {
      for (const e of edges) {
        const a = this.speciesByKey.get(e.fromKey);
        const b = this.speciesByKey.get(e.toKey);
        if (a && b) union(a.speciesId, b.speciesId);
      }
    }
    for (const s of this.speciesByKey.values()) {
      s.familyId = find(s.speciesId);
      const list = this.families.get(s.familyId) ?? [];
      if (!list.includes(s.speciesId)) list.push(s.speciesId);
      this.families.set(s.familyId, list);
      s.isFinalStage = (this.outEdges.get(s.key) ?? []).length === 0;
    }
    // stage = longest chain of ancestors (form-aware)
    const stageOf = (key: string, depth = 0): number => {
      if (depth > 6) return 0;
      const incoming = this.inEdges.get(key) ?? [];
      if (incoming.length === 0) return 0;
      return 1 + Math.max(...incoming.map((e) => stageOf(e.fromKey, depth + 1)));
    };
    for (const s of this.speciesByKey.values()) s.stage = stageOf(s.key);
  }

  private indexMegas(raw: RawReferenceBundle) {
    for (const m of raw.mega_pokemon) {
      const list = this.megas.get(m.pokemon_id) ?? [];
      list.push({
        speciesId: m.pokemon_id,
        baseForm: m.form,
        name: m.mega_name,
        stats: { atk: m.stats.base_attack, def: m.stats.base_defense, sta: m.stats.base_stamina },
        types: asTypes(m.type),
        energyFirst: m.first_time_mega_energy_required,
        energyRepeat: m.mega_energy_required,
      });
      this.megas.set(m.pokemon_id, list);
    }
  }

  private buildRaidBosses(raw: RawReferenceBundle): RaidBoss[] {
    const out: RaidBoss[] = [];
    for (const [tier, rows] of Object.entries(raw.raid_bosses.current)) {
      for (const b of rows) {
        out.push({
          speciesId: b.id,
          form: b.form,
          name: b.name,
          tier,
          types: asTypes(b.type),
          boostedWeather: b.boosted_weather,
          cpMin: b.min_unboosted_cp,
          cpMax: b.max_unboosted_cp,
          possibleShiny: b.possible_shiny,
        });
      }
    }
    return out;
  }

  private indexPvpMeta(pvpoke: PvpokeBundle) {
    for (const [cap, rows] of Object.entries(pvpoke)) {
      const league = LEAGUE_BY_CAP[cap];
      if (!league || !rows) continue;
      this.pvpTotals.set(league, rows.length);
      rows.forEach((r, i) => {
        const parsed = this.parsePvpokeName(r.n);
        if (!parsed) return;
        const key = speciesKey(parsed.speciesId, parsed.form);
        const mapKey = `${league}|${key}|${parsed.shadow ? 1 : 0}`;
        if (this.pvpMeta.has(mapKey)) return;
        this.pvpMeta.set(mapKey, {
          league,
          rank: i + 1,
          total: rows.length,
          score: r.s,
          moveset: r.m,
          statProduct: r.p,
          speciesName: r.n,
        });
      });
    }
  }

  /** "Ninetales (Alolan) (Shadow)" → {speciesId, form:'Alola', shadow:true}. */
  private parsePvpokeName(label: string): { speciesId: number; form: string; shadow: boolean } | null {
    const base = label.replace(/\(.*$/, '').trim();
    const mods = [...label.matchAll(/\(([^)]+)\)/g)].map((m) => m[1].trim());
    const speciesId = this.nameIndex.get(normalizeName(base));
    if (speciesId === undefined) return null;
    const shadow = mods.some((m) => m.toLowerCase() === 'shadow');
    let form = 'Normal';
    for (const m of mods) {
      const l = m.toLowerCase();
      if (l === 'shadow') continue;
      if (l === 'alolan') form = 'Alola';
      else if (l === 'galarian') form = 'Galarian';
      else if (l === 'hisuian') form = 'Hisuian';
      else if (l === 'paldean') form = 'Paldea';
      else {
        const match = this.formsOf(speciesId).find((f) => normalizeName(f.form) === normalizeName(m));
        if (match) form = match.form;
      }
    }
    if (!this.speciesByKey.has(speciesKey(speciesId, form))) form = 'Normal';
    return { speciesId, form, shadow };
  }
}
