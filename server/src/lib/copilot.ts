/**
 * EnerOS Copilot — the grounded, Gemini-backed energy assistant.
 *
 * ARCHITECTURE RULE (the same one the bill auditor follows): **the engine
 * decides, the Copilot explains.** This module never invents a number. It
 * receives a compact, already-computed summary of the workspace (built by
 * `buildCopilotContext`) plus the live market snapshot, and asks Gemini to
 * *narrate* that. If Gemini is unavailable the caller falls back to the
 * deterministic answers in the web/mobile clients.
 *
 * Why a computed summary and not raw rows: putting thousands of invoice rows in
 * a prompt is slow, expensive and invites arithmetic errors. The server does the
 * arithmetic; the model explains it. That keeps every answer defensible.
 */

import type { Workspace } from '../services/catalog.js';
import type { LiveTariffSnapshot } from './live/types.js';

export interface CopilotReply {
  answer: string;
  suggestions: string[];
  /** Where the answer came from, so the UI can label it honestly. */
  source: 'gemini' | 'unavailable';
  /** Why the model did not answer, when source is 'unavailable'. */
  reason?: string;
  /** Actionable next step for the failure. */
  hint?: string;
}

/**
 * The system prompt. Written to make the model behave like an *energy management
 * OS*, not a generic chatbot: lead with money, ground every claim, respect the
 * Recommend → Approve → Automate trust ladder, and never fabricate.
 */
export const COPILOT_SYSTEM_PROMPT = `You are EnerOS Copilot, the assistant inside EnerOS — the autonomous energy manager for UK SMEs.

EnerOS continuously answers four questions for the customer:
  1. What will we consume?   2. What will it cost?
  3. What should we change?  4. Can we do it automatically?

WHO YOU ARE
- You are a competent, commercial energy manager. You are not a generic chatbot.
- You lead with money (£), then time saved, then carbon/flexibility as secondary benefits.
- You speak to an operations or finance lead at a multi-site hospitality, retail, food-production or similar business.

GROUNDING — THE ONE RULE THAT MATTERS
- You are given a GROUNDED CONTEXT block. It is the customer's real, already-computed data.
- Only state facts that appear in that context. If the context does not contain the answer, say so plainly and suggest what data would be needed. Never estimate, never invent a figure, schedule, tariff or supplier.
- Quote the customer's own numbers when you use them. If you do arithmetic, show it.
- The deterministic engine decides; you explain. Do not overrule a finding.

UK ENERGY CONVENTIONS
- Electricity unit rates are pence per kWh (e.g. "24.6p/kWh"). Standing charges are pence PER DAY (e.g. "47.6p/day"). Money is GBP (£).
- The Ofgem price cap applies to domestic default tariffs; a business site may legitimately pay more. Treat "above cap" as a prompt to check, not proof of a breach.
- Time-of-use and half-hourly tariffs (e.g. Agile) have cheap and expensive half-hours. Flexibility means moving load into the cheap ones.
- Half-hourly settlement, DUoS charges, VAT and the Ofgem cap are legitimate topics.
- Do not act as a licensed energy supplier, broker or trading counterparty.

OPERATING MODEL / TRUST LADDER
- EnerOS works in three modes: Recommend → Approve → Automate. Respect the customer's current mode (given in context).
- Never claim a saving is "verified" unless the context shows a measured outcome. Use "estimated" for modelled savings.
- Savings must always reference a methodology: baseline → intervention → measured outcome.

STYLE
- Be concise and specific. Prefer short paragraphs or tight bullets over long essays.
- Use en-GB spelling. Format money as £1,234.56 and rates as 24.6p/kWh.
- If a question is outside energy management, redirect briefly to what you can help with.
- Always finish by proposing the next concrete action the customer could take.

RESPONSE FORMAT
Return ONLY a JSON object with this exact shape:
{ "answer": "<your answer, plain text, may contain newlines>", "suggestions": ["<up to 3 short follow-up questions the customer is likely to ask next>"] }
Do not wrap the JSON in markdown fences. Do not add commentary outside the JSON.`;

const gbp = (n: number): string =>
  `£${n.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const pence = (n: number): string => `${n.toFixed(2)}p`;

/**
 * Build the grounded context block from the workspace plus the live snapshot.
 * Pure and synchronous (the live snapshot is fetched by the caller), so it is
 * easy to test.
 */
export function buildCopilotContext(workspace: Workspace, live?: LiveTariffSnapshot | null): string {
  const lines: string[] = [];
  const { account, sites, invoices, actions, monthly, assetMix, controlMode } = workspace;

  const spendActual = sites.reduce((sum, s) => sum + s.monthActual, 0);
  const spendExpected = sites.reduce((sum, s) => sum + s.monthExpected, 0);
  const savings = spendExpected - spendActual;
  const savingsRate = spendExpected > 0 ? (savings / spendExpected) * 100 : 0;
  const annualSpend = workspace.annualSpendTotal || sites.reduce((sum, s) => sum + s.annualSpend, 0);

  lines.push('=== GROUNDED CONTEXT (the customer real data) ===');
  lines.push(`Company: ${account.name}`);
  lines.push(`Sites in portfolio: ${sites.length}`);
  lines.push(`Current control mode: ${controlMode} (Recommend -> Approve -> Automate)`);
  lines.push(`Performance fee on verified savings: ${account.performanceFeePct}%`);
  lines.push('');
  lines.push('--- Portfolio, current month ---');
  lines.push(`Actual spend: ${gbp(spendActual)}`);
  lines.push(`Expected spend (baseline): ${gbp(spendExpected)}`);
  lines.push(`Saving vs baseline: ${gbp(savings)} (${savingsRate.toFixed(1)}%)`);
  lines.push(`Annual energy spend: ${gbp(annualSpend)}`);

  if (monthly.length > 0) {
    const recent = monthly.slice(-6).map((m) => `${m.month}: ${gbp(m.actual)}`);
    lines.push(`Recent monthly actuals: ${recent.join(' | ')}`);
  }

  const topSites = [...sites].sort((a, b) => b.monthActual - a.monthActual).slice(0, 6);
  if (topSites.length > 0) {
    lines.push('');
    lines.push('--- Sites by spend ---');
    for (const s of topSites) {
      lines.push(
        `${s.name} (${s.type}, ${s.city || s.region}) - month ${gbp(s.monthActual)} vs expected ${gbp(
          s.monthExpected,
        )}, status ${s.status}, meter ${s.meterType}, loads: ${s.loads.join(', ')}`,
      );
    }
  }

  const flagged = invoices.filter((i) => i.status === 'Flagged');
  const flaggedValue = flagged.reduce(
    (sum, i) => sum + i.issues.reduce((v, issue) => v + Math.abs(issue.impact), 0),
    0,
  );
  lines.push('');
  lines.push('--- Billing (AI Bill Auditor) ---');
  lines.push(`Invoices on file: ${invoices.length}; flagged: ${flagged.length}`);
  if (flagged.length > 0) {
    lines.push(`Value of flagged issues: ${gbp(flaggedValue)}`);
    for (const inv of flagged.slice(0, 6)) {
      const site = sites.find((s) => s.id === inv.siteId)?.name ?? inv.siteId;
      const detail = inv.issues.map((x) => `${x.type} (${gbp(Math.abs(x.impact))})`).join('; ');
      lines.push(`${inv.id} - ${site} - ${inv.supplier} - ${gbp(inv.total)} - ${detail}`);
    }
  }

  const recommended = actions.filter((a) => a.status === 'Recommended');
  const committed = actions.filter((a) => a.status !== 'Recommended');
  const potential = actions.reduce((sum, a) => sum + a.monthlySaving, 0);
  const committedSaving = committed.reduce((sum, a) => sum + a.monthlySaving, 0);
  lines.push('');
  lines.push('--- Optimiser actions ---');
  lines.push(
    `Potential monthly saving from all actions: ${gbp(potential)}; committed (approved/automated): ${gbp(
      committedSaving,
    )}`,
  );
  lines.push(`Awaiting approval: ${recommended.length} actions`);
  for (const a of actions.slice(0, 8)) {
    const site = sites.find((s) => s.id === a.siteId)?.name ?? a.siteId;
    lines.push(
      `[${a.status}] ${a.title} - ${site} - ${a.asset} - ${gbp(a.monthlySaving)}/month - confidence ${(
        a.confidence * 100
      ).toFixed(0)}% - ${a.fromSchedule} -> ${a.toSchedule}`,
    );
  }

  if (assetMix.length > 0) {
    lines.push('');
    lines.push('--- Consumption by asset ---');
    lines.push(
      assetMix.map((a) => `${a.asset}: ${a.kwh.toLocaleString('en-GB')} kWh / ${gbp(a.spend)}`).join(' | '),
    );
  }

  if (live) {
    lines.push('');
    lines.push('--- Live UK market (real, fetched now) ---');
    lines.push(`Region: ${live.regionName} (${live.region}) - product ${live.productCode}`);
    if (live.current) lines.push(`Current half-hour price: ${pence(live.current.unitRateP)}/kWh`);
    lines.push(`Standing charge: ${pence(live.standingChargeP)}/day`);
    lines.push(
      `Today range: ${pence(live.stats.minUnitRateP)}-${pence(live.stats.maxUnitRateP)}/kWh (mean ${pence(
        live.stats.meanUnitRateP,
      )})`,
    );
    if (live.cheapest[0]) {
      lines.push(
        `Cheapest 3h window: ${live.cheapest[0].from} to ${live.cheapest[0].to} at ${pence(
          live.cheapest[0].avgUnitRateP,
        )}/kWh`,
      );
    }
    if (live.priciest[0]) {
      lines.push(
        `Peak 3h window: ${live.priciest[0].from} to ${live.priciest[0].to} at ${pence(
          live.priciest[0].avgUnitRateP,
        )}/kWh`,
      );
    }
    lines.push(`Source: ${live.source}; fetched ${live.fetchedAt}`);
  } else {
    lines.push('');
    lines.push('--- Live UK market ---');
    lines.push('Live prices were unavailable at the time of this answer.');
  }

  lines.push('');
  lines.push(
    'Reminder: answer only from the context above. If something is not here, say you do not have it.',
  );
  return lines.join('\n');
}

/**
 * Ask the Copilot a question, grounded in the workspace and the live market.
 *
 * Returns `source: 'unavailable'` when Gemini is not configured or fails, so
 * the client can fall back to its deterministic answers and label the result
 * honestly rather than pretending a model answered.
 */
export async function answerCopilot(options: {
  question: string;
  context: string;
  history?: Array<{ role: 'user' | 'assistant'; content: string }>;
}): Promise<CopilotReply> {
  const { callGeminiDetailed } = await import('./llm.js');
  const history = options.history ?? [];
  const messages: Array<{ role: 'user' | 'model'; text: string }> = [
    { role: 'user', text: options.context },
  ];
  for (const turn of history.slice(-8)) {
    messages.push({ role: turn.role === 'assistant' ? 'model' : 'user', text: turn.content });
  }
  messages.push({ role: 'user', text: options.question });

  const result = await callGeminiDetailed({
    system: COPILOT_SYSTEM_PROMPT,
    messages,
    json: true,
    temperature: 0.5,
  });

  if (!result.ok || !result.text) {
    const f = result.failure;
    console.error('[copilot] gemini unavailable', JSON.stringify({ code: f?.code, status: f?.status, message: f?.message }));
    return {
      answer: '',
      suggestions: [],
      source: 'unavailable',
      reason: f?.message,
      hint: f?.hint,
    };
  }
  const raw = result.text;

  // Gemini is asked for JSON, but parse defensively — a stray fence should not
  // break the chat.
  const cleaned = raw.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  try {
    const parsed = JSON.parse(cleaned) as { answer?: string; suggestions?: string[] };
    if (parsed.answer && parsed.answer.trim()) {
      return {
        answer: parsed.answer.trim(),
        suggestions: Array.isArray(parsed.suggestions)
          ? parsed.suggestions.filter((s) => typeof s === 'string').slice(0, 3)
          : [],
        source: 'gemini',
      };
    }
  } catch {
    // Fall through: treat the raw text as the answer.
  }
  return { answer: cleaned, suggestions: [], source: 'gemini' };
}
