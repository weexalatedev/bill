import { Router } from 'express';
import { pythonBackend } from '../env.js';

/**
 * Connector proxy.
 *
 * The browser never calls the Python FastAPI connector backend directly.
 * All device-connection calls (Octopus / Solis) go through this Node API,
 * which adds the server-side `APP_API_TOKEN` and forwards to the Python
 * service. This keeps provider keys and the bearer token out of the browser.
 *
 * Mounted at /api/connector — the frontend calls e.g.
 *   POST   /api/connector/v1/connections          (Octopus connect)
 *   GET    /api/connector/v1/homes/:home_id/devices
 *   POST   /api/connector/v1/solis/connections    (Solis connect)
 *   GET    /api/connector/v1/connections/:id/readiness
 *   etc.
 */
export const connectorRouter = Router();

if (!pythonBackend.appApiToken) {
  console.warn(
    '[connector] APP_API_TOKEN is not set — Python backend proxy will return 401. Set APP_API_TOKEN in server/.env',
  );
}

const target = pythonBackend.baseUrl.replace(/\/$/, '');

/**
 * Forward every /api/connector/* request to the Python backend, stripping
 * the /connector prefix. Query strings, headers and body are preserved.
 * Never logs request bodies (they may contain API keys/secrets).
 */
connectorRouter.all('*', async (req, res) => {
  const path = (req.originalRoute ?? req.url.replace(/^\/api\/connector/, '')) || '/';
  const url = `${target}${path}${req.url.includes('?') ? '' : ''}`;
  // Preserve query string (req.url already includes it after /api/connector)
  const fullUrl = `${target}${req.url.replace(/^\/api\/connector/, '')}`;

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