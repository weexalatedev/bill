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

import { useApp } from '../store';
import type { ChatMessage } from '../types';
import { ScreenHeader } from '../components/Layout';
import { gbp } from '../lib/format';
import { colors, font, fontWeight, radius, spacing } from '../theme';

interface CopilotMetrics {
  spendActual: number;
  spendExpected: number;
  savings: number;
  savingsRate: number;
  issuesValue: number;
}

/** Deterministic demo "LLM" — keyword-matched answers grounded in the dataset. */
function answer(question: string, metrics: CopilotMetrics): { text: string; suggestions: string[] } {
  const q = question.toLowerCase();

  if (q.includes('spend') || q.includes('cost') || q.includes('bill')) {
    return {
      text: `This month you spent ${gbp(metrics.spendActual)} across 12 sites — ${gbp(
        metrics.savings,
      )} (${metrics.savingsRate.toFixed(1)}%) below the expected baseline of ${gbp(
        metrics.spendExpected,
      )}. The biggest drivers are HVAC (32%) and refrigeration (26%).`,
      suggestions: ['Which sites are above baseline?', 'Show refrigeration anomalies'],
    };
  }

  if (q.includes('saving') || q.includes('save')) {
    return {
      text: `I have verified ${gbp(metrics.savings)} this month, plus a further ${gbp(
        2500,
      )}/month of identified opportunities waiting for approval in the Optimiser. At a 15% performance fee that costs you ${gbp(
        Math.round(metrics.savings * 0.15),
      )} — you keep the rest of the benefit.`,
      suggestions: ['What should I approve first?', 'How is the saving verified?'],
    };
  }

  if (q.includes('refriger') || q.includes('cold') || q.includes('defrost')) {
    return {
      text: 'Two refrigeration findings: the Manchester restaurant runs its defrost cycle at 17:00 inside the peak tariff window (moving it to 22:00 saves £420/month), and Northgate Foods has an overnight base load 24% above baseline — that usually points to a failing door seal or a compressor that is about to fail.',
      suggestions: ['Approve the defrost change', 'Raise a fault on Northgate Foods'],
    };
  }

  if (q.includes('ev') || q.includes('charge') || q.includes('fleet')) {
    return {
      text: 'Your EV fleet at Grand Central Hotel currently charges 19:00–22:00. The price forecast for tomorrow shows a cheap window at 01:00–04:00. Shifting charging there saves an estimated £420/month with no operational impact — the fleet is parked overnight.',
      suggestions: ['Approve EV charging shift', 'What is the price forecast?'],
    };
  }

  if (q.includes('tariff') || q.includes('rate') || q.includes('standing')) {
    return {
      text: `I found ${gbp(metrics.issuesValue)} of recoverable value in this month's invoices — including a unit rate 1.8p/kWh above contract in Manchester and a standing charge increased without notice at the hotel. You can challenge both from the Bill Auditor.`,
      suggestions: ['Challenge the Manchester invoice', 'Who is the most expensive supplier?'],
    };
  }

  if (q.includes('flex') || q.includes('battery') || q.includes('demand')) {
    return {
      text: 'Your flexible assets (battery, EV fleet, HVAC and refrigeration) can be aggregated into the flexibility market. At a 25% platform share that is a second revenue stream on top of the energy savings.',
      suggestions: ['Which assets are flexible?', 'Show flexibility revenue'],
    };
  }

  if (q.includes('verify') || q.includes('measure') || q.includes('baseline')) {
    return {
      text: 'Every site gets a 12-month baseline model. After an intervention we normalise for weather and trading hours, then compare actual usage against that baseline. No savings are claimed without this methodology.',
      suggestions: ['Show the baseline for Manchester', 'When is the next measurement?'],
    };
  }

  return {
    text: `Here's the picture: ${gbp(metrics.spendActual)} spent this month, ${gbp(
      metrics.savings,
    )} saved against baseline, and ${gbp(
      metrics.issuesValue,
    )} of billing issues to recover. Ask me about spend, savings, refrigeration, EV charging or tariffs.`,
    suggestions: ['Where are we spending most?', 'What should I approve first?'],
  };
}

const INITIAL: ChatMessage = {
  id: 'm0',
  role: 'assistant',
  text: "Hi — I'm the EnerOS Copilot. I have read your meters, bills and operating patterns. Ask me anything about your energy, or pick a suggestion below.",
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
  const { metrics } = useApp();
  const [messages, setMessages] = useState<ChatMessage[]>([INITIAL]);
  const [input, setInput] = useState('');
  const [thinking, setThinking] = useState(false);
  const listRef = useRef<FlatList<ChatMessage>>(null);

  const lastSuggestions = [...messages]
    .reverse()
    .find((m) => m.role === 'assistant' && m.suggestions?.length)?.suggestions;

  useEffect(() => {
    const t = setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 60);
    return () => clearTimeout(t);
  }, [messages, thinking]);

  const send = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || thinking) return;
    const userMessage: ChatMessage = { id: `u${Date.now()}`, role: 'user', text: trimmed };
    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setThinking(true);

    setTimeout(() => {
      const reply = answer(trimmed, metrics);
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
    }, 750);
  };

  return (
    <>
      <ScreenHeader title="Copilot" subtitle="Grounded in your live energy data" Icon={Bot} />

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


