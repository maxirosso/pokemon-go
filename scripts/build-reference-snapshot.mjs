#!/usr/bin/env node
/**
 * Downloads the community Pokémon GO datasets used by GO Compass and writes a
 * compact, minified snapshot into src/data/reference/. The snapshot is bundled
 * with the app so first launch works offline; the in-app update service
 * (src/services/reference) refreshes it at runtime and keeps the last-known-good copy.
 *
 *   node scripts/build-reference-snapshot.mjs
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'data', 'reference');
const POGOAPI = 'https://pogoapi.net/api/v1';
const PVPOKE = 'https://raw.githubusercontent.com/pvpoke/pvpoke/master/src/data/rankings/all/overall';

const POGOAPI_DATASETS = [
  'pokemon_stats',
  'pokemon_types',
  'current_pokemon_moves',
  'fast_moves',
  'charged_moves',
  'pvp_fast_moves',
  'pvp_charged_moves',
  'cp_multiplier',
  'pokemon_powerup_requirements',
  'pokemon_evolutions',
  'type_effectiveness',
  'raid_bosses',
  'released_pokemon',
  'pokemon_generations',
  'pokemon_rarity',
  'shadow_pokemon',
  'mega_pokemon',
  'weather_boosts',
  'baby_pokemon',
  'shiny_pokemon',
  'friendship_level_settings',
  'pokemon_buddy_distances',
];

const LEAGUES = [500, 1500, 2500, 10000];

async function getJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
  return res.json();
}

async function main() {
  await mkdir(OUT, { recursive: true });
  const hashes = await getJson(`${POGOAPI}/api_hashes.json`);
  const manifest = { generatedAt: new Date().toISOString(), pogoapi: {}, pvpoke: {} };

  for (const name of POGOAPI_DATASETS) {
    let data = await getJson(`${POGOAPI}/${name}.json`);
    if (name === 'raid_bosses') data = { current: data.current }; // drop historical bosses
    await writeFile(join(OUT, `${name}.json`), JSON.stringify(data));
    manifest.pogoapi[name] = hashes[`${name}.json`]?.hash_sha256 ?? null;
    console.log('pogoapi', name);
  }

  for (const cap of LEAGUES) {
    const raw = await getJson(`${PVPOKE}/rankings-${cap}.json`);
    const slim = raw.map((r) => ({
      id: r.speciesId,
      n: r.speciesName,
      s: r.score,
      m: r.moveset,
      p: r.stats?.product ?? null,
    }));
    await writeFile(join(OUT, `pvpoke_${cap}.json`), JSON.stringify(slim));
    manifest.pvpoke[String(cap)] = { count: slim.length };
    console.log('pvpoke', cap, slim.length);
  }

  await writeFile(join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2));
  console.log('Snapshot written to', OUT);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
