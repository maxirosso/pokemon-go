import { z } from 'zod';

/** Wire format between the app and the `gemini-coach` Edge Function (mirrors Gemini's `contents`). */
export type Part =
  | { text: string }
  | { functionCall: { name: string; args: Record<string, unknown> } }
  | { functionResponse: { name: string; response: Record<string, unknown> } }
  | { inlineData: { mimeType: string; data: string } };

export interface Content {
  role: 'user' | 'model';
  parts: Part[];
}

export type CoachMode = 'chat' | 'format' | 'vision';

export interface CoachRequest {
  mode: CoachMode;
  contents: Content[];
  locale: 'en' | 'es';
}

export interface CoachResponse {
  content: Content | null;
  model: string;
  finishReason?: string;
  quota?: { remainingHour: number | null; remainingDay: number | null };
}

/** Routes the AI may link to — anything else is dropped before rendering. */
export const ALLOWED_ROUTE = /^\/(pokemon\/[\w-]+(\/(evolution|powerup)\/[\w-]+)?|pokemon\/(evolution|powerup)\/[\w-]+|raids(\/boss\?[\w=&%.\-]+)?|pvp\/(great|ultra|master|little)|pvp\/team\?league=\w+|plans|resources|pokedex(\/\d+)?|teams|import|\(tabs\)(\/\w+)?)$/;

const cardSchema = z.object({
  type: z.enum(['pokemon', 'cost', 'link', 'steps']),
  title: z.string().max(140),
  detail: z.string().max(600).optional().nullable(),
  pokemonId: z.string().optional().nullable(),
  route: z.string().optional().nullable(),
  stardust: z.number().optional().nullable(),
  candy: z.number().optional().nullable(),
  xl: z.number().optional().nullable(),
  items: z.array(z.string().max(200)).max(8).optional().nullable(),
});

export const coachReplySchema = z.object({
  answer: z.string().min(1).max(3000),
  cards: z.array(cardSchema).max(8).default([]),
  followUps: z.array(z.string().max(120)).max(4).default([]),
  usedTools: z.array(z.string()).default([]),
  confidence: z.enum(['high', 'medium', 'low']).default('medium'),
});

export type CoachReply = z.infer<typeof coachReplySchema>;
export type CoachCard = z.infer<typeof cardSchema>;

/** Remove anything the app cannot safely render: unknown Pokémon ids and non-allow-listed routes. */
export function sanitizeReply(reply: CoachReply, knownPokemonIds: Set<string>): CoachReply {
  const cards = reply.cards.filter((c) => {
    if (c.type === 'pokemon') return !!c.pokemonId && knownPokemonIds.has(c.pokemonId);
    if (c.type === 'link') return !!c.route && ALLOWED_ROUTE.test(c.route);
    return true;
  });
  return { ...reply, cards };
}

export class AiUnavailableError extends Error {
  constructor(
    message: string,
    readonly reason: 'not-configured' | 'offline' | 'rate-limited' | 'server' | 'consent' | 'invalid-response' | 'disabled',
    readonly retryAfterSec?: number,
  ) {
    super(message);
    this.name = 'AiUnavailableError';
  }
}
