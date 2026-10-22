import { parseBackup, serializeBackup } from '@/engine/io/backup';
import { EMPTY_POKEMON, importJsonPokemon, splitDuplicates } from '@/engine/io/importers';
import {
  buildBackupData,
  importBatchRepo,
  kvRepo,
  planRepo,
  pokemonRepo,
  recommendationRepo,
  referenceCacheRepo,
  resourceRepo,
  restoreBackup,
  tagRepo,
  teamRepo,
  trainerRepo,
  wipeUserData,
  type DbLike,
} from '@/services/database/repositories';
import { getRef } from './helpers';
import { createTestDb } from './sqliteAdapter';

let db: DbLike;
beforeEach(async () => {
  db = await createTestDb();
  await trainerRepo.upsert(db, { nickname: 'Max', trainerLevel: 48, goals: [{ goal: 'raids', weight: 1 }] });
});

const base = EMPTY_POKEMON;

describe('Pokémon CRUD', () => {
  it('adds, reads and persists multiple Pokémon of the same species as separate records', async () => {
    const a = await pokemonRepo.insert(db, { ...base, speciesId: 448, cp: 2500, ivs: { atk: 15, def: 15, sta: 15 }, tags: ['keeper'] }, { source: 'manual' });
    const b = await pokemonRepo.insert(db, { ...base, speciesId: 448, cp: 1000, ivs: { atk: 1, def: 2, sta: 3 } }, { source: 'manual' });
    expect(a.id).not.toBe(b.id);
    const list = await pokemonRepo.listActive(db);
    expect(list).toHaveLength(2);
    expect(list[0].id).toBe(b.id); // most recent first
    const stored = await pokemonRepo.get(db, a.id);
    expect(stored).toMatchObject({ speciesId: 448, cp: 2500, ivs: { atk: 15, def: 15, sta: 15 }, tags: ['keeper'], source: 'manual' });
  });

  it('never invents IVs: unknown IVs round-trip as null', async () => {
    const p = await pokemonRepo.insert(db, { ...base, speciesId: 25, cp: 300 }, { source: 'manual' });
    expect((await pokemonRepo.get(db, p.id))!.ivs).toBeNull();
  });

  it('enforces database constraints (partial IVs, out-of-range values, shadow+purified)', async () => {
    await expect(
      db.runAsync(
        `INSERT INTO owned_pokemon (id, trainer_id, species_id, atk_iv, source, created_at, updated_at) VALUES ('x','local',1,5,'manual','t','t')`,
      ),
    ).rejects.toThrow();
    await expect(
      db.runAsync(
        `INSERT INTO owned_pokemon (id, trainer_id, species_id, atk_iv, def_iv, sta_iv, source, created_at, updated_at) VALUES ('y','local',1,5,5,99,'manual','t','t')`,
      ),
    ).rejects.toThrow();
    await expect(
      db.runAsync(`INSERT INTO owned_pokemon (id, trainer_id, species_id, shadow, purified, source, created_at, updated_at) VALUES ('z','local',1,1,1,'manual','t','t')`),
    ).rejects.toThrow();
  });

  it('edits Pokémon and updates tags', async () => {
    const p = await pokemonRepo.insert(db, { ...base, speciesId: 448, cp: 1000 }, { source: 'manual' });
    const updated = await pokemonRepo.update(db, p.id, { cp: 1200, nickname: 'Luc', shiny: true, tags: ['pvp', 'great'] });
    expect(updated).toMatchObject({ cp: 1200, nickname: 'Luc', shiny: true });
    const stored = (await pokemonRepo.get(db, p.id))!;
    expect(stored.tags.sort()).toEqual(['great', 'pvp']);
    expect(stored.updatedAt >= p.updatedAt).toBe(true);
    expect((await tagRepo.list(db)).map((t) => t.name).sort()).toEqual(['great', 'pvp']);
  });

  it('soft-deletes (undoable) and purges explicitly', async () => {
    const p = await pokemonRepo.insert(db, { ...base, speciesId: 448 }, { source: 'manual' });
    await pokemonRepo.softDelete(db, p.id);
    expect(await pokemonRepo.listActive(db)).toHaveLength(0);
    expect(await pokemonRepo.listDeleted(db)).toHaveLength(1);
    await pokemonRepo.restore(db, p.id);
    expect(await pokemonRepo.listActive(db)).toHaveLength(1);
    await pokemonRepo.softDelete(db, p.id);
    await pokemonRepo.purgeDeleted(db);
    expect(await pokemonRepo.get(db, p.id)).toBeNull();
  });

  it('handles thousands of records quickly', async () => {
    const many = Array.from({ length: 3000 }, (_, i) => ({ ...base, speciesId: (i % 150) + 1, cp: 100 + i, ivs: { atk: i % 16, def: (i >> 2) % 16, sta: (i >> 4) % 16 } }));
    const t0 = Date.now();
    await pokemonRepo.insertMany(db, many, { source: 'csv' });
    expect(await pokemonRepo.count(db)).toBe(3000);
    expect((await pokemonRepo.listActive(db)).length).toBe(3000);
    expect(Date.now() - t0).toBeLessThan(15000);
  });

  it('cascades and tracks import provenance', async () => {
    const batch = await importBatchRepo.create(db, 'csv', 'x.csv', 2, 0);
    const p = await pokemonRepo.insert(db, { ...base, speciesId: 1, tags: ['a'] }, { source: 'csv', importBatchId: batch });
    expect((await pokemonRepo.get(db, p.id))!.importBatchId).toBe(batch);
    await pokemonRepo.deleteByBatch(db, batch);
    expect(await pokemonRepo.count(db)).toBe(0);
    expect((await db.getAllAsync('SELECT * FROM pokemon_tag')).length).toBe(0); // cascade
  });
});

describe('resources, teams, plans', () => {
  it('stores resources per family and distinguishes 0 from unknown', async () => {
    await resourceRepo.set(db, 'stardust', null, 100000);
    await resourceRepo.set(db, 'candy', '448', 0);
    await resourceRepo.set(db, 'candy_xl', '448', 12);
    let list = await resourceRepo.list(db);
    expect(list).toContainEqual({ type: 'candy', scope: '448', amount: 0 });
    expect(list).toContainEqual({ type: 'stardust', scope: null, amount: 100000 });
    await resourceRepo.set(db, 'candy_xl', '448', null); // unset = unknown again
    list = await resourceRepo.list(db);
    expect(list.find((r) => r.type === 'candy_xl')).toBeUndefined();
    await resourceRepo.set(db, 'stardust', null, 5); // upsert
    expect((await resourceRepo.list(db)).find((r) => r.type === 'stardust')!.amount).toBe(5);
  });

  it('saves teams with ordered members and drops deleted Pokémon', async () => {
    const [a, b, c] = await pokemonRepo.insertMany(db, [1, 2, 3].map((n) => ({ ...base, speciesId: n })), { source: 'manual' });
    const id = await teamRepo.save(db, { name: 'GL', mode: 'great', bossKey: null, memberIds: [c.id, a.id, b.id] });
    expect((await teamRepo.list(db))[0].memberIds).toEqual([c.id, a.id, b.id]);
    await pokemonRepo.softDelete(db, a.id);
    expect((await teamRepo.list(db))[0].memberIds).toEqual([c.id, b.id]);
    await pokemonRepo.deleteAll(db);
    expect((await teamRepo.list(db))[0].memberIds).toEqual([]);
    await teamRepo.remove(db, id);
    expect(await teamRepo.list(db)).toHaveLength(0);
  });

  it('tracks plan actions and statuses', async () => {
    const p = await pokemonRepo.insert(db, { ...base, speciesId: 448 }, { source: 'manual' });
    const a = await planRepo.add(db, {
      pokemonId: p.id,
      actionType: 'POWER_UP',
      title: 'Power up Lucario',
      targetLevel: 40,
      targetSpeciesKey: null,
      estimatedStardust: 88000,
      estimatedCandy: 68,
      estimatedXl: 0,
      priority: 1,
      note: null,
      dependsOn: null,
      reminderAt: null,
    });
    await planRepo.setStatus(db, a.id, 'done');
    const list = await planRepo.list(db);
    expect(list[0]).toMatchObject({ status: 'done', estimatedStardust: 88000 });
    expect(list[0].completedAt).not.toBeNull();
    await pokemonRepo.deleteAll(db);
    expect((await planRepo.list(db))[0].pokemonId).toBeNull(); // ON DELETE SET NULL
  });

  it('stores recommendation history', async () => {
    const p = await pokemonRepo.insert(db, { ...base, speciesId: 448 }, { source: 'manual' });
    await recommendationRepo.replaceCurrent(db, [
      { pokemonId: p.id, action: 'POWER_UP', priority: 1, impact: 40, costJson: '{}', reason: 'r', confidence: 'high', datasetVersion: 'v' },
    ]);
    await recommendationRepo.replaceCurrent(db, []);
    expect((await db.getAllAsync('SELECT * FROM recommendation')).length).toBe(0);
  });

  it('caches reference datasets atomically with versions', async () => {
    await referenceCacheRepo.putMany(db, [{ provider: 'pogoapi', dataset: 'fast_moves', payload: '[]', version: 'abc', checksum: 'abc' }]);
    await referenceCacheRepo.putMany(db, [{ provider: 'pogoapi', dataset: 'fast_moves', payload: '[1]', version: 'def', checksum: 'def' }]);
    expect((await referenceCacheRepo.getAll(db, 'pogoapi'))[0].payload).toBe('[1]');
    expect((await referenceCacheRepo.versions(db))[0].version).toBe('def');
    await kvRepo.set(db, 'k', 'v');
    expect(await kvRepo.get(db, 'k')).toBe('v');
  });
});

describe('backup & restore', () => {
  it('exports and restores a full collection (replace mode)', async () => {
    const [a] = await pokemonRepo.insertMany(
      db,
      [
        { ...base, speciesId: 448, cp: 2500, ivs: { atk: 15, def: 15, sta: 15 }, tags: ['keeper'], shiny: true },
        { ...base, speciesId: 25 },
      ],
      { source: 'manual' },
    );
    await resourceRepo.set(db, 'stardust', null, 777);
    await teamRepo.save(db, { name: 'T', mode: 'raid', bossKey: null, memberIds: [a.id] });
    const text = serializeBackup(await buildBackupData(db));
    const parsed = parseBackup(text);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    const fresh = await createTestDb();
    const summary = await restoreBackup(fresh, parsed.backup, 'replace');
    expect(summary.pokemonAdded).toBe(2);
    const restored = await pokemonRepo.listActive(fresh);
    expect(restored.find((p) => p.id === a.id)).toMatchObject({ speciesId: 448, cp: 2500, shiny: true, tags: ['keeper'] });
    expect((await resourceRepo.list(fresh))[0].amount).toBe(777);
    expect((await teamRepo.list(fresh))[0].memberIds).toEqual([a.id]);
    expect((await trainerRepo.get(fresh))!.nickname).toBe('Max');
  });

  it('merge mode is idempotent (restoring twice never duplicates)', async () => {
    await pokemonRepo.insert(db, { ...base, speciesId: 448, cp: 2500 }, { source: 'manual' });
    const parsed = parseBackup(serializeBackup(await buildBackupData(db)));
    if (!parsed.ok) throw new Error('parse');
    const s1 = await restoreBackup(db, parsed.backup, 'merge');
    const s2 = await restoreBackup(db, parsed.backup, 'merge');
    expect(s1.pokemonAdded).toBe(0);
    expect(s2.pokemonSkipped).toBe(1);
    expect(await pokemonRepo.count(db)).toBe(1);
  });

  it('wipes user data but keeps the schema', async () => {
    await pokemonRepo.insert(db, { ...base, speciesId: 1 }, { source: 'manual' });
    await wipeUserData(db);
    expect(await pokemonRepo.count(db)).toBe(0);
    expect(await trainerRepo.get(db)).toBeNull();
    await trainerRepo.upsert(db, { nickname: 'New', trainerLevel: 1 });
    expect((await trainerRepo.get(db))!.nickname).toBe('New');
  });
});

describe('import → persist pipeline', () => {
  it('imports valid rows, rejects bad ones, and prevents duplicates on re-import', async () => {
    const ref = getRef();
    const json = JSON.stringify([
      { name: 'Lucario', cp: 2500, ivs: { atk: 15, def: 15, sta: 15 }, level: 30 },
      { name: 'Nonexistent' },
    ]);
    const r1 = importJsonPokemon(ref, json);
    expect(r1.accepted).toHaveLength(1);
    expect(r1.rejected).toHaveLength(1);
    const { fresh } = splitDuplicates(await pokemonRepo.listActive(db), r1.accepted);
    await pokemonRepo.insertMany(db, fresh, { source: 'json' });
    const r2 = importJsonPokemon(ref, json);
    const second = splitDuplicates(await pokemonRepo.listActive(db), r2.accepted);
    expect(second.duplicates).toHaveLength(1);
    expect(second.fresh).toHaveLength(0);
    expect(await pokemonRepo.count(db)).toBe(1);
  });
});
