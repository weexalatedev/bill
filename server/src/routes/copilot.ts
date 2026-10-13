import { Router } from 'express';
import { z } from 'zod';
import { requireUser, type AuthedRequest } from '../auth.js';
import { env, geminiEnabled } from '../env.js';
import { getWorkspace } from '../services/workspace.js';
import { answerCopilot, buildCopilotContext } from '../lib/copilot.js';
import { getLiveTariffSnapshot } from '../lib/live/index.js';

export const copilotRouter = Router();

const chatSchema = z.object({
  message: z.string().min(1).max(2000),
  history: z
    .array(z.object({ role: z.enum(['user', 'assistant']), content: z.string().max(4000) }))
    .max(20)
    .optional(),
  /** Optional site id — used to resolve the live region for grounding. */
  siteId: z.string().optional(),
});

/** Starter prompts shown when the thread is empty. */
const STARTERS = [
  'Where are we spending most?',
  'What should I approve first?',
  'Any billing issues this month?',
  'When should we charge the EV fleet?',
  'Explain the refrigeration anomaly',
  'How is the saving verified?',
];

/**
 * Grounded Copilot chat.
 *
 * The server computes the customer's numbers (spend, baseline, findings,
 * actions) and the live market snapshot, hands both to Gemini as *context*, and
 * returns the narrated answer. With no Gemini key the endpoint returns
 * `source: "unavailable"` and the client answers deterministically — the chat
 * never breaks, it just tells the truth about where the answer came from.
 */
copilotRouter.post('/chat', requireUser, async (req: AuthedRequest, res, next) => {
  try {
    const parsed = chatSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'A message is required.' });
      return;
    }

    const workspace = await getWorkspace(req.ownerId!, env.autoProvision);

    // Live prices are best-effort grounding — never block the answer on them.
    let live = null;
    try {
      const site =
        workspace.sites.find((s) => s.id === parsed.data.siteId) ??
        [...workspace.sites].sort((a, b) => b.monthActual - a.monthActual)[0];
      live = await getLiveTariffSnapshot({
        region: site?.region,
        postcode: site?.postcode,
        windowHours: 3,
      });
    } catch {
      live = null;
    }

    const context = buildCopilotContext(workspace, live);
    const reply = await answerCopilot({
      question: parsed.data.message,
      context,
      history: parsed.data.history,
    });

    res.json({
      reply: reply.answer,
      suggestions: reply.suggestions,
      source: reply.source,
      reason: reply.reason,
      hint: reply.hint,
      geminiEnabled,
      groundedOn: {
        sites: workspace.sites.length,
        invoices: workspace.invoices.length,
        actions: workspace.actions.length,
        live: Boolean(live),
      },
    });
  } catch (error) {
    next(error);
  }
});

/** Starter prompts + whether the LLM path is live. Public. */
copilotRouter.get('/suggestions', (_req, res) => {
  res.json({ suggestions: STARTERS, geminiEnabled });
});

/**
 * Gemini diagnostics. Authed, but returns no secrets — only whether the key is
 * present (with a hint), the model, and the result of one live call including
 * the exact failure reason. This is the fastest way to answer "why is Gemini
 * failing?" without shell access to the server.
 */
copilotRouter.get('/diagnose', requireUser, async (_req, res, next) => {
  try {
    const { describeGemini, callGeminiDetailed } = await import('../lib/llm.js');
    const config = describeGemini();
    let live: unknown = null;
    if (config.configured) {
      const result = await callGeminiDetailed({
        system: 'You are a connectivity test. Reply with exactly the word OK.',
        messages: [{ role: 'user', text: 'Reply OK.' }],
        temperature: 0,
      });
      live = result.ok
        ? { ok: true, sample: (result.text ?? '').slice(0, 60) }
        : { ok: false, failure: result.failure };
    }
    res.json({
      config,
      live,
      hint: config.configured
        ? 'If live.ok is false, the failure.code names the cause (http/network/timeout/empty).'
        : 'Set GEMINI_API_KEY in server/.env and restart the API.',
    });
  } catch (error) {
    next(error);
  }
});
