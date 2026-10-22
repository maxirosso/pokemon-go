import { router, type Href } from 'expo-router';
import { Bot, ChevronRight, Cpu, MessageSquarePlus, Send, Sparkles, Trash2, X } from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, TextInput, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { PokemonImage } from '@/components/pokemon/PokemonImage';
import { Pill } from '@/components/ui/Pill';
import { IconButton, Screen } from '@/components/ui/Screen';
import { Note } from '@/components/ui/States';
import { Card } from '@/components/ui/Surface';
import { Text } from '@/components/ui/Text';
import { toast } from '@/components/ui/Toast';
import { answerLocally, SUGGESTED_QUESTIONS } from '@/features/assistant/localAnswer';
import { makeToolEnv } from '@/features/assistant/tools';
import { askCoach } from '@/services/ai/coach';
import { isAiConfigured } from '@/services/ai/config';
import { AiUnavailableError, coachReplySchema, ALLOWED_ROUTE, type CoachCard, type CoachReply } from '@/services/ai/protocol';
import { getDb } from '@/services/database/db';
import { chatRepo } from '@/services/database/repositories';
import { buildAnalysisContext, useAnalysis } from '@/store/analysis';
import { useData } from '@/store/data';
import { useSettings } from '@/store/settings';
import { useT } from '@/i18n';
import { useTheme } from '@/theme/useTheme';
import { fmtInt } from '@/utils/format';
import { haptic } from '@/utils/haptics';

interface Msg {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  reply?: CoachReply;
  source?: 'ai' | 'local' | 'error';
  note?: string;
}

function CardView({ card }: { card: CoachCard }) {
  const { c } = useTheme();
  const pokemon = useData((s) => s.pokemon);
  if (card.type === 'pokemon') {
    const p = pokemon.find((x) => x.id === card.pokemonId);
    if (!p) return null;
    return (
      <Card onPress={() => router.push(`/pokemon/${p.id}` as Href)} padded={false}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10 }}>
          <View style={{ width: 48, height: 48, borderRadius: 12, backgroundColor: c.canvas, alignItems: 'center', justifyContent: 'center' }}>
            <PokemonImage speciesId={p.speciesId} form={p.form} shiny={p.shiny} size={44} kind="sprite" />
          </View>
          <View style={{ flex: 1 }}>
            <Text variant="bodyMedium" numberOfLines={2}>{card.title}</Text>
            {card.detail ? <Text variant="caption" color="muted" numberOfLines={3}>{card.detail}</Text> : null}
          </View>
          <ChevronRight size={16} color={c.textMuted} />
        </View>
      </Card>
    );
  }
  if (card.type === 'cost') {
    return (
      <Card style={{ gap: 4 }}>
        <Text variant="micro" color="muted">{card.title.toUpperCase()}</Text>
        <Text variant="numMd">
          {[card.stardust ? `${fmtInt(card.stardust)} Stardust` : null, card.candy ? `${fmtInt(card.candy)} Candy` : null, card.xl ? `${fmtInt(card.xl)} XL` : null].filter(Boolean).join(' + ') || 'No resources'}
        </Text>
      </Card>
    );
  }
  if (card.type === 'link' && card.route && ALLOWED_ROUTE.test(card.route)) {
    return (
      <Card onPress={() => router.push(card.route as Href)} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Text variant="bodyMedium" color="accent" style={{ flex: 1 }}>{card.title}</Text>
        <ChevronRight size={16} color={c.accent} />
      </Card>
    );
  }
  if (card.type === 'steps') {
    return (
      <Card style={{ gap: 6 }}>
        <Text variant="bodyMedium">{card.title}</Text>
        {(card.items ?? []).map((s, i) => <Text key={i} variant="small" color="secondary">{i + 1}. {s}</Text>)}
      </Card>
    );
  }
  return null;
}

function Bubble({ m, onFollowUp }: { m: Msg; onFollowUp: (q: string) => void }) {
  const { c } = useTheme();
  if (m.role === 'user') {
    return (
      <View style={{ alignSelf: 'flex-end', maxWidth: '86%', backgroundColor: c.accent, borderRadius: 20, borderBottomRightRadius: 6, padding: 12 }}>
        <Text variant="body" color="onAccent">{m.text}</Text>
      </View>
    );
  }
  return (
    <Animated.View entering={FadeInDown.duration(200)} style={{ gap: 8, maxWidth: '96%' }}>
      <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
        <Pill label={m.source === 'ai' ? 'AI COACH · GEMINI' : m.source === 'local' ? 'COMPUTED ON DEVICE' : 'NOTICE'} tone={m.source === 'ai' ? 'purple' : m.source === 'local' ? 'accent' : 'warning'} icon={m.source === 'ai' ? <Sparkles size={10} color={c.purple} /> : <Cpu size={10} color={m.source === 'local' ? c.accent : c.warning} />} />
        {m.reply ? <Pill label={`CONFIDENCE ${m.reply.confidence.toUpperCase()}`} /> : null}
      </View>
      <View style={{ backgroundColor: c.surface, borderRadius: 20, borderTopLeftRadius: 6, padding: 14, borderWidth: 1, borderColor: c.border, gap: 8 }}>
        <Text variant="body">{m.reply?.answer ?? m.text}</Text>
        {m.note ? <Text variant="caption" color="warning">{m.note}</Text> : null}
        {m.reply && m.reply.usedTools.length > 0 ? <Text variant="caption" color="muted">Grounded in: {m.reply.usedTools.map((t) => t.replace(/_/g, ' ')).join(', ')}</Text> : null}
      </View>
      {m.reply?.cards.map((card, i) => <CardView key={i} card={card} />)}
      {m.reply && m.reply.followUps.length > 0 ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          {m.reply.followUps.map((f) => (
            <Pressable key={f} accessibilityRole="button" onPress={() => onFollowUp(f)} style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 16, borderWidth: 1, borderColor: c.borderStrong }}>
              <Text variant="small" color="secondary">{f}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
    </Animated.View>
  );
}

export default function Assistant() {
  const { c } = useTheme();
  const t = useT();
  const listRef = useRef<FlatList<Msg>>(null);
  const settings = useSettings();
  const trainer = useData((s) => s.trainer);
  const account = useAnalysis((s) => s.account);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [convId, setConvId] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState('');
  const [quota, setQuota] = useState<{ h: number | null; d: number | null } | null>(null);
  const configured = isAiConfigured() && settings.aiEnabled;

  // restore the most recent conversation
  useEffect(() => {
    (async () => {
      const db = await getDb();
      const convs = await chatRepo.listConversations(db);
      if (convs[0]) {
        setConvId(convs[0].id);
        const rows = await chatRepo.messages(db, convs[0].id);
        setMessages(
          rows.map((r) => {
            const j = JSON.parse(r.contentJson) as { text?: string; reply?: unknown; source?: Msg['source']; note?: string };
            const reply = j.reply ? coachReplySchema.safeParse(j.reply) : null;
            return { id: r.id, role: r.role, text: j.text ?? '', reply: reply?.success ? reply.data : undefined, source: j.source, note: j.note };
          }),
        );
      }
    })().catch(() => undefined);
  }, []);

  const persist = useCallback(async (cid: string, role: 'user' | 'assistant', content: unknown) => {
    try {
      await chatRepo.addMessage(await getDb(), cid, role, content);
    } catch {
      // history is best-effort
    }
  }, []);

  const send = useCallback(
    async (raw: string) => {
      const question = raw.trim();
      if (!question || busy) return;
      haptic('light');
      setInput('');
      setBusy(true);
      setStep('Thinking…');
      const userMsg: Msg = { id: `u${Date.now()}`, role: 'user', text: question };
      setMessages((m) => [...m, userMsg]);

      let cid = convId;
      if (!cid) {
        const conv = await chatRepo.createConversation(await getDb(), question.slice(0, 48));
        cid = conv.id;
        setConvId(cid);
      }
      await persist(cid, 'user', { text: question });

      const env = makeToolEnv(buildAnalysisContext(), account, useAnalysis.getState().peers);
      const history = messages.filter((m) => m.source !== 'error').map((m) => ({ role: m.role, text: m.reply?.answer ?? m.text }));
      let assistant: Msg;
      try {
        if (!settings.aiEnabled) throw new AiUnavailableError('AI features are turned off in Settings.', 'disabled');
        const res = await askCoach({ history, question, env, locale: settings.language, onStep: setStep });
        if (res.quota) setQuota({ h: res.quota.remainingHour, d: res.quota.remainingDay });
        assistant = { id: `a${Date.now()}`, role: 'assistant', text: res.reply.answer, reply: res.reply, source: 'ai' };
      } catch (e) {
        const local = answerLocally(question, env);
        const why =
          e instanceof AiUnavailableError
            ? e.reason === 'rate-limited'
              ? `AI quota reached${e.retryAfterSec ? ` — try again in ~${Math.ceil(e.retryAfterSec / 60)} min` : ''}.`
              : e.reason === 'not-configured'
                ? 'The AI backend is not configured (see Settings → AI coach & cloud).'
                : e.reason === 'offline'
                  ? 'You appear to be offline or the AI service is unreachable.'
                  : e.reason === 'disabled'
                    ? 'AI features are turned off.'
                    : e.message
            : 'The AI service had a problem.';
        assistant = local
          ? { id: `a${Date.now()}`, role: 'assistant', text: local.answer, reply: local, source: 'local', note: `${why} This answer was computed on your device from the same deterministic engine.` }
          : { id: `a${Date.now()}`, role: 'assistant', text: `${t('ai.unavailable')}\n\n${why}\nTry one of the suggested questions — those can be answered offline.`, source: 'error' };
      }
      setMessages((m) => [...m, assistant]);
      await persist(cid, 'assistant', { text: assistant.text, reply: assistant.reply, source: assistant.source, note: assistant.note });
      setBusy(false);
      setStep('');
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 80);
    },
    [busy, convId, messages, account, settings.aiEnabled, settings.language, persist, t],
  );

  const newChat = () => {
    setMessages([]);
    setConvId(null);
  };
  const clearAll = async () => {
    await chatRepo.clearAll(await getDb());
    newChat();
    toast.success('Conversation history cleared');
  };

  const empty = messages.length === 0;
  const status = useMemo(
    () => (configured ? { label: 'AI ONLINE', tone: 'purple' as const } : { label: 'OFFLINE MODE', tone: 'warning' as const }),
    [configured],
  );

  return (
    <Screen
      scroll={false}
      title={t('advisor.askAi')}
      subtitle="STRATEGY COACH"
      showBack={false}
      headerRight={
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <IconButton label="New conversation" onPress={newChat}><MessageSquarePlus size={18} color={c.text} /></IconButton>
          <IconButton label="Clear history" onPress={() => void clearAll()}><Trash2 size={18} color={c.textSecondary} /></IconButton>
          <IconButton label="Close" onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)'))}><X size={20} color={c.text} /></IconButton>
        </View>
      }
      contentStyle={{ paddingHorizontal: 0 }}
    >
      <View style={{ paddingHorizontal: 16, gap: 8 }}>
        <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
          <Pill label={status.label} tone={status.tone} />
          {quota ? <Pill label={`${quota.h ?? '?'} LEFT THIS HOUR`} /> : null}
        </View>
        {!configured ? (
          <Note tone="warning">
            The AI coach needs the optional Supabase + Gemini backend ({!settings.aiEnabled ? 'turned off in Settings' : 'not configured'}). You can still ask the common questions below — they are answered on your device from the deterministic engine.
          </Note>
        ) : !settings.hasSeenAiNotice ? (
          <Card variant="warning" style={{ gap: 6 }}>
            <Text variant="small" color="secondary">
              Privacy: questions and the compact results of the tools the AI calls (e.g. a list of your Pokémon with CP/IVs) are sent to your Gemini backend to write the answer. Nothing else leaves your device. The AI explains computed results — it does not invent stats.
            </Text>
            <Pressable accessibilityRole="button" onPress={() => settings.set({ hasSeenAiNotice: true })}><Text variant="small" color="accent">Got it</Text></Pressable>
          </Card>
        ) : null}
      </View>

      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={(m) => m.id}
        contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 24 }}
        renderItem={({ item }) => <Bubble m={item} onFollowUp={(q) => void send(q)} />}
        ListEmptyComponent={
          <View style={{ gap: 10, paddingTop: 8 }}>
            <View style={{ alignItems: 'center', gap: 8, paddingVertical: 12 }}>
              <View style={{ width: 60, height: 60, borderRadius: 30, backgroundColor: c.purpleSoft, alignItems: 'center', justifyContent: 'center' }}>
                <Bot size={28} color={c.purple} />
              </View>
              <Text variant="h3" align="center">Ask about {trainer ? `${trainer.nickname}’s` : 'your'} account</Text>
              <Text variant="small" color="secondary" align="center">I read your real Pokémon through the app’s calculators — I don’t make up stats.</Text>
            </View>
            {SUGGESTED_QUESTIONS.map((q) => (
              <Card key={q} onPress={() => void send(q)} style={{ paddingVertical: 12 }}>
                <Text variant="small">{q}</Text>
              </Card>
            ))}
          </View>
        }
        ListFooterComponent={busy ? <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}><ActivityIndicator color={c.accent} /><Text variant="small" color="muted">{step}</Text></View> : undefined}
        onContentSizeChange={() => !empty && listRef.current?.scrollToEnd({ animated: true })}
        keyboardShouldPersistTaps="handled"
      />

      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8, padding: 12, borderTopWidth: 1, borderTopColor: c.border, backgroundColor: c.background }}>
        <TextInput
          value={input}
          onChangeText={setInput}
          placeholder="Ask your coach…"
          placeholderTextColor={c.textMuted}
          multiline
          maxLength={500}
          onSubmitEditing={() => void send(input)}
          accessibilityLabel="Message"
          style={{ flex: 1, minHeight: 46, maxHeight: 120, backgroundColor: c.canvas, borderRadius: 23, paddingHorizontal: 16, paddingVertical: 12, color: c.text, fontFamily: 'Geist_400Regular', fontSize: 16, borderWidth: 1, borderColor: c.elevatedHigh }}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Send"
          disabled={busy || !input.trim()}
          onPress={() => void send(input)}
          style={{ width: 46, height: 46, borderRadius: 23, backgroundColor: c.accent, alignItems: 'center', justifyContent: 'center', opacity: busy || !input.trim() ? 0.4 : 1 }}
        >
          <Send size={20} color={c.accentOn} />
        </Pressable>
      </View>
    </Screen>
  );
}
