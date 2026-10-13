import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Bot, Lightbulb, Send, Sparkles, User } from 'lucide-react-native';

import { useAuth } from '../lib/auth';
import { api } from '../lib/api';
import type { ChatMessage } from '../types';
import { ScreenHeader } from '../components/Layout';
import { colors, font, fontWeight, radius, spacing } from '../theme';

const INITIAL: ChatMessage = {
  id: 'm0',
  role: 'assistant',
  text: "Hi — I'm the EnerOS Copilot, powered by Gemini and grounded in your live meters, bills and market data. Ask me anything about your energy, or pick a suggestion below.",
  suggestions: ['Where are we spending most?', 'What should I approve first?', 'Any billing issues?'],
};

const CODEX = [
  'Where are we spending most?',
  'Any billing issues this month?',
  'What should I approve first?',
  'Explain the refrigeration anomaly',
  'When should we charge the EV fleet?',
  'How is the saving verified?',
];

export default function CopilotScreen() {
  const { getToken } = useAuth();
  const [messages, setMessages] = useState<ChatMessage[]>([INITIAL]);
  const [input, setInput] = useState('');
  const [thinking, setThinking] = useState(false);
  /** Whether the API reports Gemini as live — drives the header honestly. */
  const [source, setSource] = useState<'gemini' | 'unavailable' | null>(null);
  const listRef = useRef<FlatList<ChatMessage>>(null);

  const lastSuggestions = [...messages]
    .reverse()
    .find((m) => m.role === 'assistant' && m.suggestions?.length)?.suggestions;

  useEffect(() => {
    api
      .copilotSuggestions()
      .then((s) => setSource(s.geminiEnabled ? 'gemini' : 'unavailable'))
      .catch(() => setSource(null));
  }, []);

  useEffect(() => {
    const t = setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 60);
    return () => clearTimeout(t);
  }, [messages, thinking]);

  const send = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || thinking) return;
    const userMessage: ChatMessage = { id: `u${Date.now()}`, role: 'user', text: trimmed };
    const history = messages
      .filter((m) => m.id !== 'm0')
      .map((m) => ({ role: m.role, content: m.text }));
    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setThinking(true);

    let reply: { text: string; suggestions?: string[] };
    let used: 'gemini' | 'unavailable' = 'unavailable';
    try {
      const token = (await getToken()) ?? '';
      const res = await api.copilotChat(token, { message: trimmed, history });
      if (res.source === 'gemini' && res.reply.trim()) {
        reply = { text: res.reply, suggestions: res.suggestions };
        used = 'gemini';
      } else if (res.geminiEnabled) {
        reply = {
          text: 'Gemini could not answer just now — the request to the model failed. I will not guess at your numbers; please try again in a moment.',
        };
      } else {
        reply = {
          text: 'The Gemini API is not configured on the server, so I cannot answer without inventing figures. Set GEMINI_API_KEY on the API and reload — every number you see elsewhere in EnerOS is still live.',
        };
      }
    } catch {
      reply = {
        text: 'I could not reach the Copilot API just now — check that the API is running and try again. I would rather say that than make something up.',
      };
    }
    setSource(used);
    setMessages((prev) => [
      ...prev,
      {
        id: `a${Date.now()}`,
        role: 'assistant',
        text: reply.text,
        suggestions: reply.suggestions,
      },
    ]);
    setThinking(false);
  };

  return (
    <>
      <ScreenHeader
        title="Copilot"
        subtitle={
          source === 'unavailable'
            ? 'Gemini offline — set GEMINI_API_KEY on the API'
            : 'Gemini · grounded in your data'
        }
        Icon={Bot}
      />

      <KeyboardAvoidingView
        style={s.fill}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={8}
      >
        <View style={s.fill}>
          <FlatList
            ref={listRef}
            data={messages}
            keyExtractor={(item) => item.id}
            contentContainerStyle={s.thread}
            showsVerticalScrollIndicator={false}
            renderItem={({ item }) => {
              const isUser = item.role === 'user';
              return (
                <View style={[s.msgRow, isUser && s.msgRowUser]}>
                  <View style={[s.avatar, isUser && s.avatarUser]}>
                    {isUser ? (
                      <User size={15} color={colors.white} strokeWidth={2} />
                    ) : (
                      <Sparkles size={15} color={colors.emerald600} strokeWidth={2} />
                    )}
                  </View>
                  <View style={[s.bubble, isUser ? s.bubbleUser : s.bubbleBot]}>
                    <Text style={[s.bubbleText, isUser && s.bubbleTextUser]}>{item.text}</Text>
                  </View>
                </View>
              );
            }}
            ListFooterComponent={
              <View style={{ gap: spacing.md, paddingTop: thinking ? 0 : spacing.sm }}>
                {thinking ? (
                  <View style={s.msgRow}>
                    <View style={s.avatar}>
                      <Sparkles size={15} color={colors.emerald600} strokeWidth={2} />
                    </View>
                    <View style={[s.bubble, s.bubbleBot, s.thinking]}>
                      <ActivityIndicator size="small" color={colors.slate500} />
                      <Text style={s.thinkingText}>Analysing your energy data…</Text>
                    </View>
                  </View>
                ) : null}

                <View style={s.howCard}>
                  <View style={s.howPill}>
                    <Lightbulb size={12} color={colors.emerald400} strokeWidth={2.4} />
                    <Text style={s.howPillText}>How it works</Text>
                  </View>
                  <Text style={s.howText}>
                    The Copilot explains decisions; a deterministic optimisation engine makes them.
                    Ask “why” and it shows the reasoning behind a control change.
                  </Text>
                </View>
              </View>
            }
          />
        </View>

        <View style={s.footer}>
          {lastSuggestions && lastSuggestions.length > 0 ? (
            <View style={s.chipsWrap}>
              {lastSuggestions.map((suggestion) => (
                <Pressable
                  key={suggestion}
                  onPress={() => send(suggestion)}
                  style={s.suggestion}
                  accessibilityRole="button"
                >
                  <Text style={s.suggestionText}>{suggestion}</Text>
                </Pressable>
              ))}
            </View>
          ) : null}

          <View style={s.inputRow}>
            <TextInput
              value={input}
              onChangeText={setInput}
              placeholder="Ask about your energy…"
              placeholderTextColor={colors.slate400}
              style={s.input}
              onSubmitEditing={() => send(input)}
              returnKeyType="send"
              autoCapitalize="none"
              autoCorrect={false}
            />
            <Pressable
              onPress={() => send(input)}
              disabled={thinking || input.trim().length === 0}
              accessibilityRole="button"
              accessibilityLabel="Send message"
              style={({ pressed }) => [
                s.sendBtn,
                (thinking || input.trim().length === 0) && s.sendBtnDisabled,
                pressed && { opacity: 0.8 },
              ]}
            >
              <Send size={18} color={colors.white} strokeWidth={2.2} />
            </Pressable>
          </View>

          <Text style={s.tryLabel}>Try asking</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={s.codexRow}
          >
            {CODEX.map((item) => (
              <Pressable key={item} onPress={() => send(item)} style={s.codexChip}>
                <Text style={s.codexText}>{item}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </>
  );
}

const s = StyleSheet.create({
  fill: { flex: 1, backgroundColor: colors.slate100 },
  thread: { padding: spacing.lg, gap: spacing.md },

  msgRow: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' },
  msgRowUser: { flexDirection: 'row-reverse' },
  avatar: {
    width: 30,
    height: 30,
    borderRadius: 9,
    backgroundColor: 'rgba(16,185,129,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarUser: { backgroundColor: colors.ink900 },
  bubble: {
    maxWidth: '80%',
    borderRadius: 18,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
  },
  bubbleBot: { backgroundColor: colors.white, borderWidth: 1, borderColor: colors.slate200 },
  bubbleUser: { backgroundColor: colors.ink900 },
  bubbleText: { fontSize: font.md, color: colors.slate700, lineHeight: font.md + 7 },
  bubbleTextUser: { color: colors.white },

  thinking: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  thinkingText: { fontSize: font.sm, color: colors.slate500 },

  footer: {
    borderTopWidth: 1,
    borderTopColor: colors.slate200,
    backgroundColor: colors.white,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
    gap: spacing.sm,
  },
  chipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  suggestion: {
    borderWidth: 1,
    borderColor: colors.slate200,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 7,
    backgroundColor: colors.slate50,
  },
  suggestionText: { fontSize: font.xs + 1, color: colors.slate600, fontWeight: fontWeight.medium },

  inputRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.slate200,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: 11,
    fontSize: font.md,
    color: colors.slate800,
    backgroundColor: colors.white,
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: radius.lg,
    backgroundColor: colors.emerald600,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnDisabled: { opacity: 0.4 },

  tryLabel: {
    fontSize: font.xs,
    fontWeight: fontWeight.semibold,
    color: colors.slate400,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginTop: 2,
  },
  codexRow: { gap: spacing.sm, paddingRight: spacing.sm },
  codexChip: {
    borderWidth: 1,
    borderColor: colors.slate200,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 7,
    backgroundColor: colors.white,
  },
  codexText: { fontSize: font.xs + 1, color: colors.slate600 },

  howCard: {
    backgroundColor: colors.ink900,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.sm,
  },
  howPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 4,
  },
  howPillText: { fontSize: font.xs, fontWeight: fontWeight.semibold, color: colors.emerald400 },
  howText: { fontSize: font.sm, color: colors.slate300, lineHeight: font.md + 6 },
});


