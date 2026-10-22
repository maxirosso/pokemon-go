import { z } from 'zod';

/**
 * Runtime schemas for the raw third-party datasets (PoGoAPI + PvPoke).
 * Every external payload is validated here before it is normalised, so a provider
 * changing its format fails loudly (and falls back to the last-known-good snapshot)
 * instead of silently corrupting recommendations.
 *
 * Schemas are intentionally tolerant of *extra* fields (providers add fields over time)
 * but strict about the fields the engine relies on.
 */

const formStr = z.string();

export const statsRowSchema = z.object({
  base_attack: z.number(),
  base_defense: z.number(),
  base_stamina: z.number(),
  form: formStr,
  pokemon_id: z.number().int(),
  pokemon_name: z.string(),
});

export const typesRowSchema = z.object({
  form: formStr,
  pokemon_id: z.number().int(),
  pokemon_name: z.string(),
  type: z.array(z.string()),
});

export const movePoolRowSchema = z.object({
  charged_moves: z.array(z.string()),
  elite_charged_moves: z.array(z.string()),
  elite_fast_moves: z.array(z.string()),
  fast_moves: z.array(z.string()),
  form: formStr,
  pokemon_id: z.number().int(),
  pokemon_name: z.string(),
});

export const fastMoveRowSchema = z.object({
  duration: z.number(),
  energy_delta: z.number(),
  move_id: z.number(),
  name: z.string(),
  power: z.number(),
  type: z.string(),
});

export const chargedMoveRowSchema = z.object({
  critical_chance: z.number().optional(),
  duration: z.number(),
  energy_delta: z.number(),
  move_id: z.number(),
  name: z.string(),
  power: z.number(),
  type: z.string(),
});

export const pvpFastMoveRowSchema = z.object({
  energy_delta: z.number(),
  move_id: z.number(),
  name: z.string(),
  power: z.number(),
  turn_duration: z.number(),
  type: z.string(),
});

export const pvpChargedMoveRowSchema = z.object({
  buffs: z
    .object({
      activation_chance: z.number(),
      attacker_attack_stat_stage_change: z.number().optional(),
      attacker_defense_stat_stage_change: z.number().optional(),
      target_attack_stat_stage_change: z.number().optional(),
      target_defense_stat_stage_change: z.number().optional(),
    })
    .optional(),
  energy_delta: z.number(),
  move_id: z.number(),
  name: z.string(),
  power: z.number(),
  turn_duration: z.number().optional(),
  type: z.string(),
});

export const cpmRowSchema = z.object({ level: z.number(), multiplier: z.number() });

export const powerUpRowSchema = z.object({
  candy_to_upgrade: z.number(),
  current_level: z.number(),
  level_after_powering: z.number(),
  stardust_to_upgrade: z.number(),
  xl_candy_to_upgrade: z.number(),
});

export const evolutionRowSchema = z.object({
  evolutions: z.array(
    z.object({
      candy_required: z.number(),
      form: formStr,
      pokemon_id: z.number().int(),
      pokemon_name: z.string(),
      item_required: z.string().optional(),
      lure_required: z.string().optional(),
      priority: z.number().optional(),
      no_candy_cost_if_traded: z.boolean().optional(),
      buddy_distance_required: z.number().optional(),
      must_be_buddy_to_evolve: z.boolean().optional(),
      only_evolves_in_daytime: z.boolean().optional(),
      only_evolves_in_nighttime: z.boolean().optional(),
      gender_required: z.string().optional(),
      upside_down: z.boolean().optional(),
    }),
  ),
  form: formStr,
  pokemon_id: z.number().int(),
  pokemon_name: z.string(),
});

export const typeEffectivenessSchema = z.record(z.string(), z.record(z.string(), z.number()));

export const raidBossRowSchema = z.object({
  boosted_weather: z.array(z.string()),
  form: formStr,
  id: z.number().int(),
  max_unboosted_cp: z.number(),
  min_unboosted_cp: z.number(),
  name: z.string(),
  possible_shiny: z.boolean(),
  tier: z.union([z.number(), z.string()]),
  type: z.array(z.string()),
});

export const raidBossesSchema = z.object({
  current: z.record(z.string(), z.array(raidBossRowSchema)),
});

export const namedIdMapSchema = z.record(z.string(), z.object({ id: z.number().int(), name: z.string() }));

export const generationsSchema = z.record(
  z.string(),
  z.array(z.object({ generation_number: z.number().int(), id: z.number().int(), name: z.string() })),
);

export const raritySchema = z.record(
  z.string(),
  z.array(z.object({ form: formStr, pokemon_id: z.number().int(), pokemon_name: z.string(), rarity: z.string() })),
);

export const megaRowSchema = z.object({
  first_time_mega_energy_required: z.number(),
  form: formStr,
  mega_energy_required: z.number(),
  mega_name: z.string(),
  pokemon_id: z.number().int(),
  pokemon_name: z.string(),
  stats: z.object({ base_attack: z.number(), base_defense: z.number(), base_stamina: z.number() }),
  type: z.array(z.string()),
});

export const weatherBoostsSchema = z.record(z.string(), z.array(z.string()));

export const babySchema = z.array(z.object({ form: formStr, id: z.number().int(), name: z.string() }));

export const shinySchema = z.record(z.string(), z.object({ id: z.number().int(), name: z.string() }).passthrough());

export const friendshipSchema = z.array(
  z.object({ attack_bonus: z.number(), friendship_level: z.number(), name: z.string() }).passthrough(),
);

export const buddyDistancesSchema = z.record(
  z.string(),
  z.array(z.object({ distance: z.number(), form: formStr, pokemon_id: z.number().int(), pokemon_name: z.string() })),
);

export const pvpokeRankingSchema = z.array(
  z.object({
    id: z.string(),
    n: z.string(),
    s: z.number(),
    m: z.array(z.string()),
    p: z.number().nullable(),
  }),
);

export const rawBundleSchema = z.object({
  pokemon_stats: z.array(statsRowSchema),
  pokemon_types: z.array(typesRowSchema),
  current_pokemon_moves: z.array(movePoolRowSchema),
  fast_moves: z.array(fastMoveRowSchema),
  charged_moves: z.array(chargedMoveRowSchema),
  pvp_fast_moves: z.array(pvpFastMoveRowSchema),
  pvp_charged_moves: z.array(pvpChargedMoveRowSchema),
  cp_multiplier: z.array(cpmRowSchema),
  pokemon_powerup_requirements: z.record(z.string(), powerUpRowSchema),
  pokemon_evolutions: z.array(evolutionRowSchema),
  type_effectiveness: typeEffectivenessSchema,
  raid_bosses: raidBossesSchema,
  released_pokemon: namedIdMapSchema,
  pokemon_generations: generationsSchema,
  pokemon_rarity: raritySchema,
  shadow_pokemon: namedIdMapSchema,
  mega_pokemon: z.array(megaRowSchema),
  weather_boosts: weatherBoostsSchema,
  baby_pokemon: babySchema,
  shiny_pokemon: shinySchema,
  friendship_level_settings: friendshipSchema,
  pokemon_buddy_distances: buddyDistancesSchema,
});

export type RawReferenceBundle = z.infer<typeof rawBundleSchema>;
export type RawDatasetName = keyof RawReferenceBundle;

export const RAW_DATASET_SCHEMAS = {
  pokemon_stats: z.array(statsRowSchema),
  pokemon_types: z.array(typesRowSchema),
  current_pokemon_moves: z.array(movePoolRowSchema),
  fast_moves: z.array(fastMoveRowSchema),
  charged_moves: z.array(chargedMoveRowSchema),
  pvp_fast_moves: z.array(pvpFastMoveRowSchema),
  pvp_charged_moves: z.array(pvpChargedMoveRowSchema),
  cp_multiplier: z.array(cpmRowSchema),
  pokemon_powerup_requirements: z.record(z.string(), powerUpRowSchema),
  pokemon_evolutions: z.array(evolutionRowSchema),
  type_effectiveness: typeEffectivenessSchema,
  raid_bosses: raidBossesSchema,
  released_pokemon: namedIdMapSchema,
  pokemon_generations: generationsSchema,
  pokemon_rarity: raritySchema,
  shadow_pokemon: namedIdMapSchema,
  mega_pokemon: z.array(megaRowSchema),
  weather_boosts: weatherBoostsSchema,
  baby_pokemon: babySchema,
  shiny_pokemon: shinySchema,
  friendship_level_settings: friendshipSchema,
  pokemon_buddy_distances: buddyDistancesSchema,
} as const;

export type PvpokeRankingRaw = z.infer<typeof pvpokeRankingSchema>;
export type PvpokeBundle = Partial<Record<'500' | '1500' | '2500' | '10000', PvpokeRankingRaw>>;
