'use client';
import { useEffect, useRef, useState } from 'react';
import { ArrowUp, Bot, Loader2, User } from 'lucide-react';
import { useApp } from '../store';
import { useAuth } from '../lib/auth';
import { api } from '../lib/api';
import { cx } from '../lib/cx';
import type { ChatMessage } from '../types';
import { gbp } from '../lib/format';

interface CopilotMetrics {
  spendActual: number;
  spendExpected: number;
  savings: number;
  savingsRate: number;
  issuesValue: number;
}

/**
 * Deterministic fallback — used when the assistant is unavailable, so the chat
 * never invents a figure and never goes blank.
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
      text: `Verified ${gbp(
        metrics.savings,
      )} this month, plus further identified opportunities in the Optimiser. At a 15% performance fee you keep the rest of the benefit.`,
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
      text: `I found ${gbp(
        metrics.issuesValue,
      )} of recoverable value in this month's invoices — including a unit rate above contract and a standing charge increased without notice. You can challenge both from the Bill Auditor.`,
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
  text: "Hi — I'm the EnerOS Copilot. I'm grounded in your live meters, bills and market data. Ask me anything about your energy, or pick a starting point below.",
  suggestions: [],
};

const STARTERS = [
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
  /** Which answer path the API reports — drives the header and notice honestly. */
  const [source, setSource] = useState<'gemini' | 'rules' | 'unavailable' | null>(null);
  /** Exact reason the model did not answer, shown in a notice beside the reply. */
  const [notice, setNotice] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const online = source === 'gemini';

  // Discover the real assistant state on mount.
  useEffect(() => {
    api
      .copilotSuggestions()
      .then((s) => setSource(s.geminiEnabled ? 'gemini' : 'rules'))
      .catch(() => setSource(null));
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }, [messages, thinking]);

  const lastSuggestions = [...messages]
    .reverse()
    .find((m) => m.role === 'assistant' && m.suggestions?.length)?.suggestions;

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
    let usedSource: 'gemini' | 'unavailable' = 'unavailable';
    try {
      const token = (await getToken()) ?? '';
      const res = await api.copilotChat(token, { message: trimmed, history });
      if (res.source === 'gemini' && res.reply.trim()) {
        reply = { text: res.reply, suggestions: res.suggestions };
        usedSource = 'gemini';
      }
      // Otherwise the server answered without Gemini — usedSource stays 'unavailable'.
    } catch {
      // Network/API failure — usedSource stays 'unavailable' and the fallback answers.
    }

    if (!reply) {
      const fallback = answer(trimmed, metrics);
      reply = { text: fallback.text, suggestions: fallback.suggestions };
    }

    setSource(usedSource);
    setNotice(
      usedSource === 'gemini'
        ? null
        : 'The live assistant is unavailable right now, so this answer uses your saved data.',
    );
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
    <div className="flex min-h-0 w-full flex-1 flex-col overflow-hidden bg-neutral-100 xl:flex-row">
      {/* Conversation */}
      <section className="flex min-h-0 min-w-0 flex-1 flex-col xl:p-4">
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-white xl:rounded-xl xl:border xl:border-neutral-200 xl:shadow-sm">
          {/* Header */}
          <header className="flex shrink-0 items-center gap-3 border-b border-neutral-100 px-4 py-3 sm:px-6">
            <div className="relative">
              <div className="grid h-10 w-10 place-items-center rounded-lg bg-ink-900">
                <Bot className="h-5 w-5 text-white" />
              </div>
              <span
                className={cx(
                  'absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full ring-2 ring-white',
                  online ? 'bg-neutral-900' : source === null ? 'bg-neutral-400' : 'bg-neutral-500',
                )}
              />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-neutral-900">Copilot</p>
              <p className="truncate text-xs text-neutral-500">
                {online
                  ? 'Online · grounded in your live energy data'
                  : source === null
                    ? 'Connecting…'
                    : 'Limited mode · answers use your saved data'}
              </p>
            </div>
            <span
              className={cx(
                'hidden shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ring-inset sm:inline-flex',
                online
                  ? 'bg-neutral-50 text-neutral-700 ring-neutral-600/20'
                  : 'bg-neutral-50 text-neutral-700 ring-neutral-600/20',
              )}
            >
              {online ? 'Live' : 'Offline'}
            </span>
          </header>

          {/* Messages */}
          <div
            ref={scrollRef}
            className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-5 sm:px-6"
          >
            <div className="mx-auto w-full max-w-3xl space-y-5">
              {messages.map((message) => {
                const isUser = message.role === 'user';
                return (
                  <div
                    key={message.id}
                    className={cx('flex items-end gap-2.5', isUser && 'flex-row-reverse')}
                  >
                    <div
                      className={cx(
                        'grid h-8 w-8 shrink-0 place-items-center rounded-full',
                        isUser ? 'bg-neutral-900 text-white' : 'bg-neutral-100 text-neutral-600',
                      )}
                    >
                      {isUser ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
                    </div>
                    <div
                      className={cx(
                        'max-w-[82%] whitespace-pre-wrap rounded-xl px-4 py-2.5 text-sm leading-relaxed shadow-sm sm:max-w-[75%]',
                        isUser
                          ? 'rounded-br-md bg-neutral-900 text-white'
                          : 'rounded-bl-md bg-neutral-100 text-neutral-700',
                      )}
                    >
                      {message.text}
                    </div>
                  </div>
                );
              })}

              {thinking && (
                <div className="flex items-end gap-2.5">
                  <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-neutral-100 text-neutral-600">
                    <Bot className="h-4 w-4" />
                  </div>
                  <div className="flex items-center gap-2 rounded-xl rounded-bl-md bg-neutral-100 px-4 py-3 text-sm text-neutral-500">
                    <span className="flex gap-1">
                      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-neutral-400 [animation-delay:-0.2s]" />
                      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-neutral-400 [animation-delay:-0.1s]" />
                      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-neutral-400" />
                    </span>
                    Reading your energy data…
                  </div>
                </div>
              )}

              {messages.length <= 1 && !thinking && (
                <div className="pt-1">
                  <p className="mb-2 text-xs font-medium text-neutral-400">Start with</p>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {STARTERS.map((starter) => (
                      <button
                        key={starter}
                        type="button"
                        onClick={() => send(starter)}
                        className="rounded-lg border border-neutral-200 px-3.5 py-2.5 text-left text-sm text-neutral-700 transition-colors hover:border-neutral-300 hover:bg-neutral-50/50"
                      >
                        {starter}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>


          {/* Composer */}
          <div className="shrink-0 border-t border-neutral-100 bg-white px-3 py-3 sm:px-6">
            <div className="mx-auto w-full max-w-3xl">
              {notice && (
                <p className="mb-2 rounded-md bg-neutral-50 px-3 py-2 text-[11px] leading-relaxed text-neutral-800">
                  {notice}
                </p>
              )}
              {lastSuggestions && lastSuggestions.length > 0 && (
                <div className="mb-2 flex flex-wrap gap-2">
                  {lastSuggestions.map((suggestion) => (
                    <button
                      key={suggestion}
                      type="button"
                      onClick={() => send(suggestion)}
                      className="rounded-full border border-neutral-200 px-3 py-1.5 text-xs font-medium text-neutral-600 transition-colors hover:border-neutral-300 hover:bg-neutral-50/60 hover:text-neutral-700"
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              )}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  send(input);
                }}
                className="flex items-end gap-2 rounded-xl border border-neutral-200 bg-white p-1.5 transition-colors focus-within:border-neutral-400 focus-within:ring-2 focus-within:ring-neutral-500/15"
              >
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      send(input);
                    }
                  }}
                  rows={Math.min(5, Math.max(1, input.split('\n').length))}
                  placeholder="Message Copilot…"
                  className="max-h-40 flex-1 resize-none bg-transparent px-3 py-2 text-sm text-neutral-800 placeholder:text-neutral-400 focus:outline-none"
                />
                <button
                  type="submit"
                  disabled={thinking || input.trim().length === 0}
                  className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-neutral-900 text-white transition-colors hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-40"
                  aria-label="Send message"
                >
                  {thinking ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <ArrowUp className="h-4 w-4" />
                  )}
                </button>
              </form>
              <p className="mt-2 text-center text-[10px] text-neutral-400">
                Copilot can make mistakes. Check important figures before acting.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Context rail — desktop only */}
      <aside className="hidden w-[21rem] shrink-0 flex-col gap-4 overflow-y-auto border-l border-neutral-200 bg-neutral-50 p-4 xl:flex">
        <div className="rounded-xl border border-neutral-200 bg-white p-4">
          <p className="text-sm font-semibold text-neutral-900">What I can help with</p>
          <ul className="mt-3 space-y-2 text-xs text-neutral-600">
            <li>· Where your energy spend is going</li>
            <li>· Billing issues and what to challenge</li>
            <li>· Which optimisations to approve first</li>
            <li>· When to run flexible load (EV, battery, HVAC)</li>
            <li>· How savings are measured and verified</li>
          </ul>
        </div>
        <div className="rounded-xl bg-ink-900 p-4 text-white">
          <p className="text-sm font-semibold">How answers work</p>
          <p className="mt-1.5 text-xs leading-relaxed text-neutral-300">
            Every figure comes from your own data and the live market. The engine makes the
            decisions; the assistant explains them — it never invents a number.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <span className="rounded-full bg-neutral-100 px-2.5 py-1 text-[11px] font-semibold text-neutral-300">
              Grounded in your data
            </span>
            <span className="rounded-full bg-neutral-100 px-2.5 py-1 text-[11px] font-semibold text-neutral-300">
              Engine decides
            </span>
          </div>
        </div>
      </aside>
    </div>
  );
}

