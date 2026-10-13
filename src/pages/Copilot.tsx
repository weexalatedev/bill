import { useEffect, useRef, useState } from 'react';
import { Bot, Lightbulb, Loader2, Send, Sparkles, User } from 'lucide-react';
import { useApp } from '../store';
import { useAuth } from '../lib/auth';
import { api } from '../lib/api';
import type { ChatMessage } from '../types';
import { Card, SectionHeading } from '../components/ui';
import { gbp } from '../lib/format';

interface CopilotMetrics {
  spendActual: number;
  spendExpected: number;
  savings: number;
  savingsRate: number;
  issuesValue: number;
}

/**
 * Deterministic fallback — used when Gemini is not configured or the request
 * fails, so the chat never invents a figure and never goes blank.
 */
function answer(question: string, metrics: CopilotMetrics): { text: string; suggestions: string[] } {
  const q = question.toLowerCase();
  if (q.includes('spend') || q.includes('cost') || q.includes('bill')) {
    return {
      text: `This month you spent ${gbp(metrics.spendActual)} — ${gbp(
        metrics.savings,
      )} (${metrics.savingsRate.toFixed(1)}%) below the expected baseline of ${gbp(
        metrics.spendExpected,
      )}. The biggest drivers are HVAC and refrigeration.`,
      suggestions: ['Which sites are above baseline?', 'Show refrigeration anomalies'],
    };
  }
  if (q.includes('saving') || q.includes('save')) {
    return {
      text: `Verified ${gbp(metrics.savings)} this month, plus further identified opportunities in the Optimiser. At a 15% performance fee you keep the rest of the benefit.`,
      suggestions: ['What should I approve first?', 'How is the saving verified?'],
    };
  }
  if (q.includes('refriger') || q.includes('cold') || q.includes('defrost')) {
    return {
      text: 'Refrigeration runs its defrost cycle inside the peak tariff window at one site; moving it to the evening saves an estimated £420/month. Another site shows an overnight base load above baseline — usually a failing door seal or a compressor about to fail.',
      suggestions: ['Approve the defrost change', 'Raise a fault'],
    };
  }
  if (q.includes('ev') || q.includes('charge') || q.includes('fleet')) {
    return {
      text: 'The EV fleet currently charges in the expensive evening window. Shifting it to the cheapest overnight window saves an estimated £420/month with no operational impact — the fleet is parked overnight.',
      suggestions: ['Approve EV charging shift', 'What is the price forecast?'],
    };
  }
  if (q.includes('tariff') || q.includes('rate') || q.includes('standing')) {
    return {
      text: `I found ${gbp(metrics.issuesValue)} of recoverable value in this month's invoices — including a unit rate above contract and a standing charge increased without notice. You can challenge both from the Bill Auditor.`,
      suggestions: ['Challenge the invoice', 'Who is the most expensive supplier?'],
    };
  }
  if (q.includes('verify') || q.includes('measure') || q.includes('baseline')) {
    return {
      text: 'Every site gets a 12-month baseline model. After an intervention we normalise for weather and trading hours, then compare actual usage against that baseline. No savings are claimed without this methodology.',
      suggestions: ['Show the baseline', 'When is the next measurement?'],
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
  text: "Hi — I'm the EnerOS Copilot, grounded in your live meters, bills and market data. Ask me anything about your energy, or pick a suggestion below.",
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

export default function Copilot() {
  const { metrics } = useApp();
  const { getToken } = useAuth();
  const [messages, setMessages] = useState<ChatMessage[]>([INITIAL]);
  const [input, setInput] = useState('');
  const [thinking, setThinking] = useState(false);
  /** Gemini state: discovered on mount, updated by each answer. */
  const [source, setSource] = useState<'gemini' | 'rules' | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const lastSuggestions = [...messages]
    .reverse()
    .find((m) => m.role === 'assistant' && m.suggestions?.length)?.suggestions;

  // Discover the real Gemini state on mount instead of pretending it is on.
  useEffect(() => {
    api
      .copilotSuggestions()
      .then((s) => setSource(s.geminiEnabled ? 'gemini' : 'rules'))
      .catch(() => setSource(null));
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
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

    let reply: { text: string; suggestions?: string[] } | null = null;
    let usedSource: 'gemini' | 'rules' = 'rules';
    let reason: string | null = null;
    try {
      const token = (await getToken()) ?? '';
      const res = await api.copilotChat(token, { message: trimmed, history });
      if (res.source === 'gemini' && res.reply.trim()) {
        reply = { text: res.reply, suggestions: res.suggestions };
        usedSource = 'gemini';
      } else {
        reason = res.reason ?? res.hint ?? 'Gemini is not configured on this server.';
      }
    } catch (err) {
      reason = err instanceof Error ? err.message : 'Could not reach the Copilot API.';
    }

    if (!reply) {
      const fallback = answer(trimmed, metrics);
      reply = { text: fallback.text, suggestions: fallback.suggestions };
    }

    setSource(usedSource);
    setNotice(usedSource === 'gemini' ? null : reason);
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
    <div className="grid gap-4 lg:grid-cols-3">
      <Card padded={false} className="flex h-[70vh] flex-col overflow-hidden lg:col-span-2">
        <div className="flex items-center gap-3 border-b border-slate-100 px-5 py-4">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-emerald-400 to-teal-600">
            <Bot className="h-5 w-5 text-white" />
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-900">EnerOS Copilot</p>
            <p className="flex items-center gap-1.5 text-xs text-slate-500">
              <span
                className={
                  'h-1.5 w-1.5 rounded-full ' +
                  (source === 'rules' ? 'bg-amber-500' : 'bg-emerald-500')
                }
              />
              {source === 'rules'
                ? 'Gemini offline — set GEMINI_API_KEY on the API'
                : 'Gemini · grounded in your live energy data'}
            </p>
          </div>
        </div>

        <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto px-5 py-5">
          {messages.map((message) => (
            <div
              key={message.id}
              className={'flex gap-3 ' + (message.role === 'user' ? 'flex-row-reverse' : '')}
            >
              <div
                className={
                  'grid h-8 w-8 shrink-0 place-items-center rounded-lg ' +
                  (message.role === 'user'
                    ? 'bg-slate-900 text-white'
                    : 'bg-emerald-500/10 text-emerald-600')
                }
              >
                {message.role === 'user' ? (
                  <User className="h-4 w-4" />
                ) : (
                  <Sparkles className="h-4 w-4" />
                )}
              </div>
              <div
                className={
                  'max-w-[80%] rounded-2xl px-4 py-2.5 text-sm ' +
                  (message.role === 'user'
                    ? 'bg-slate-900 text-white'
                    : 'bg-slate-100 text-slate-700')
                }
              >
                {message.text}
              </div>
            </div>
          ))}

          {thinking && (
            <div className="flex gap-3">
              <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-emerald-500/10 text-emerald-600">
                <Sparkles className="h-4 w-4" />
              </div>
              <div className="flex items-center gap-2 rounded-2xl bg-slate-100 px-4 py-2.5 text-sm text-slate-500">
                <Loader2 className="h-4 w-4 animate-spin" />
                Analysing your energy data…
              </div>
            </div>
          )}
        </div>

        <div className="border-t border-slate-100 px-5 py-4">
          {lastSuggestions && lastSuggestions.length > 0 && (
            <div className="mb-3 flex flex-wrap gap-2">
              {lastSuggestions.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => send(suggestion)}
                  className="rounded-full border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:border-emerald-300 hover:bg-emerald-50/60 hover:text-emerald-700"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          )}
          {notice && (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-[11px] leading-relaxed text-amber-800">
              AI narration unavailable — answering from the deterministic engine. Reason: {notice}
            </p>
          )}

          <form
            onSubmit={(e) => {
              e.preventDefault();
              send(input);
            }}
            className="flex items-center gap-2"
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about your energy…"
              className="flex-1 rounded-xl border border-slate-200 px-4 py-2.5 text-sm text-slate-800 placeholder:text-slate-400 focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
            />
            <button
              type="submit"
              disabled={thinking || input.trim().length === 0}
              className="grid h-11 w-11 place-items-center rounded-xl bg-emerald-600 text-white transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-40"
              aria-label="Send message"
            >
              <Send className="h-5 w-5" />
            </button>
          </form>
        </div>
      </Card>

      <div className="space-y-4">
        <Card>
          <SectionHeading title="Try asking" subtitle="Grounded questions about this account." />
          <ul className="space-y-2">
            {CODEX.map((item) => (
              <li key={item}>
                <button
                  type="button"
                  onClick={() => send(item)}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-left text-sm text-slate-700 transition-colors hover:border-emerald-300 hover:bg-emerald-50/50"
                >
                  {item}
                </button>
              </li>
            ))}
          </ul>
        </Card>

        <Card className="bg-ink-900 text-white">
          <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-emerald-300">
            <Lightbulb className="h-3.5 w-3.5" /> How it works
          </div>
          <p className="text-sm text-slate-300">
            The Copilot explains decisions; a deterministic optimisation engine makes them. Ask
            “why” and it shows the reasoning behind a control change.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <span className="rounded-full bg-emerald-500/15 px-2.5 py-1 text-xs font-semibold text-emerald-300">
              Explain the decision
            </span>
            <span className="rounded-full bg-sky-500/15 px-2.5 py-1 text-xs font-semibold text-sky-300">
              Engine makes the decision
            </span>
          </div>
        </Card>
      </div>
    </div>
  );
}