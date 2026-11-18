import { Router } from 'express';
import type { AuthedRequest } from '../auth.js';
import { pythonBackend } from '../env.js';
import { SiteModel } from '../models/index.js';
import { resolveSubscription } from '../services/subscription.js';

/**
 * Connector proxy.
 *
 * The browser never calls the Python FastAPI connector backend directly.
 * All device-connection calls (Octopus / Solis) go through this Node API,
 * which adds the server-side `APP_API_TOKEN` and forwards to the Python
 * service. This keeps provider keys and the bearer token out of the browser.
 *
 * Connect operations are additionally guarded by the plan's device limit, so
 * subscribing to a plan grants (and caps) the number of devices the customer
 * may attach. The count is read from the connector itself across every site
 * the owner has — the connector owns the truth of "how many devices".
 */
export const connectorRouter = Router();

if (!pythonBackend.appApiToken) {
  console.warn(
    '[connector] APP_API_TOKEN is not set — Python backend proxy will return 401. Set APP_API_TOKEN in server/.env',
  );
}

const target = pythonBackend.baseUrl.replace(/\/$/, '');

/** POST endpoints that create a new device connection. */
const CONNECT_ROUTES = [/\/v1\/solis\/connections$/, /\/v1\/connections$/];

/** Count connected devices across every site the owner holds. */
async function countConnectedDevices(ownerId: string): Promise<number> {
  const sites = (await SiteModel.find({ ownerId }, { id: 1 }).lean().exec()) as { id: string }[];
  let total = 0;
  for (const site of sites) {
    try {
      const res = await fetch(`${target}/v1/homes/${encodeURIComponent(site.id)}/devices`, {
        headers: { Authorization: `Bearer ${pythonBackend.appApiToken}` },
      });
      if (res.ok) {
        const rows = (await res.json()) as unknown;
        if (Array.isArray(rows)) total += rows.length;
      }
    } catch {
      // The connector is unreachable; the forwarded connect will surface its own 502.
    }
  }
  return total;
}

/**
 * Forward every /api/connector/* request to the Python backend, stripping
 * the /connector prefix. Query strings, headers and body are preserved.
 * Never logs request bodies (they may contain API keys/secrets).
 */
connectorRouter.all('*', async (req: AuthedRequest, res) => {
  const path = (req.url || '').replace(/^\/api\/connector/, '').split('?')[0];

  // Cap device connections to the plan's `deviceLimit`.
  if (
    req.method === 'POST' &&
    req.ownerId &&
    CONNECT_ROUTES.some((pattern) => pattern.test(path))
  ) {
    try {
      const subscription = await resolveSubscription(req.ownerId);
      const used = await countConnectedDevices(req.ownerId);
      if (used >= subscription.deviceLimit) {
        res.status(403).json({
          error: `Device limit reached — your ${subscription.planName} plan supports up to ${subscription.deviceLimit} connected devices.`,
          code: 'device_limit_reached',
        });
        return;
      }
    } catch {
      // Cannot resolve the entitlement right now; let the upstream service decide.
    }
  }

  // Preserve query string (req.url already includes it after /api/connector)
  const fullUrl = `${target}${(req.url || '').replace(/^\/api\/connector/, '')}`;

  try {
    const upstream = await fetch(fullUrl, {
      method: req.method,
      headers: {
        Authorization: `Bearer ${pythonBackend.appApiToken}`,
        // Forward content-type for POST/PUT bodies
        ...(req.headers['content-type']
          ? { 'content-type': req.headers['content-type'] as string }
          : {}),
      },
      // GET/DELETE/HEAD have no body
      body:
        req.method === 'GET' || req.method === 'HEAD' || req.method === 'DELETE'
          ? undefined
          : req.body
            ? JSON.stringify(req.body)
            : undefined,
    });

    const contentType = upstream.headers.get('content-type') ?? 'application/json';
    const text = await upstream.text();

    res.status(upstream.status).set('content-type', contentType).send(text);
  } catch {
    res.status(502).json({ error: 'Connector backend unavailable.' });
  }
});