// api/meta/index.js
// Minimal MetaApi router: no proxy usage, clear errors, dual auth headers.

const express = require('express');
const router = express.Router();

// Prefer the new API base; trim trailing slash just in case
const METAAPI_BASE  = (process.env.METAAPI_BASE || 'https://api.metaapi.cloud').replace(/\/+$/, '');
const METAAPI_TOKEN = process.env.METAAPI_TOKEN || '';

// Use Node 20's global fetch; fall back to node-fetch if needed
const fetch = (global.fetch ? global.fetch.bind(global) : require('node-fetch'));

function ensureToken(res) {
  if (!METAAPI_TOKEN) {
    res.status(500).json({ ok: false, error: 'METAAPI_TOKEN not set on server' });
    return false;
  }
  return true;
}

async function metaFetch(path, init = {}) {
  // ABSOLUTELY NO PROXY AGENTS HERE
  const url = METAAPI_BASE + path;

  // Send both the modern Bearer and legacy auth-token headers to be safe
  const headers = Object.assign(
    {
      'Authorization': `Bearer ${METAAPI_TOKEN}`,
      'auth-token': METAAPI_TOKEN,
      'Content-Type': 'application/json'
    },
    init.headers || {}
  );

  const resp = await fetch(url, { ...init, headers });
  const text = await resp.text();

  let data;
  try { data = text ? JSON.parse(text) : null; }
  catch { data = { raw: text }; }

  return { ok: resp.ok, status: resp.status, data, url };
}

/** Router health */
router.get('/health', (req, res) => {
  res.json({
    ok: true,
    ts: Date.now(),
    node: process.version,
    hasMetaToken: !!METAAPI_TOKEN,
    metaBase: METAAPI_BASE
  });
});

/** Quick diag to prove no proxy envs are being used */
router.get('/diag', (req, res) => {
  const env = process.env;
  res.json({
    ok: true,
    suspectedProxyEnv: {
      HTTP_PROXY: env.HTTP_PROXY || null,
      HTTPS_PROXY: env.HTTPS_PROXY || null,
      ALL_PROXY: env.ALL_PROXY || null,
      NO_PROXY: env.NO_PROXY || null,
      http_proxy: env.http_proxy || null,
      https_proxy: env.https_proxy || null,
      all_proxy: env.all_proxy || null,
      no_proxy: env.no_proxy || null,
      METAAPI_HTTP_PROXY: env.METAAPI_HTTP_PROXY || null,
    }
  });
});

/** GET /api/meta/accounts → MetaApi: /users/current/accounts */
router.get('/accounts', async (req, res) => {
  if (!ensureToken(res)) return;
  try {
    const r = await metaFetch('/users/current/accounts');
    if (!r.ok) return res.status(r.status).json({ ok: false, upstream: r.data, url: r.url });
    res.status(200).json(r.data || []);
  } catch (e) {
    res.status(502).json({ ok: false, error: 'upstream_error', details: String(e) });
  }
});

/** GET /api/meta/positions?accountId=... → /users/current/accounts/{id}/positions */
router.get('/positions', async (req, res) => {
  if (!ensureToken(res)) return;
  const id = String(req.query.accountId || '').trim();
  if (!id) return res.status(400).json({ ok: false, error: 'accountId is required' });
  try {
    const r = await metaFetch(`/users/current/accounts/${encodeURIComponent(id)}/positions`);
    if (!r.ok) return res.status(r.status).json({ ok: false, upstream: r.data, url: r.url });
    res.status(200).json(r.data || []);
  } catch (e) {
    res.status(502).json({ ok: false, error: 'upstream_error', details: String(e) });
  }
});

/** GET /api/meta/info?accountId=... → /users/current/accounts/{id}/accountInformation */
router.get('/info', async (req, res) => {
  if (!ensureToken(res)) return;
  const id = String(req.query.accountId || '').trim();
  if (!id) return res.status(400).json({ ok: false, error: 'accountId is required' });
  try {
    const r = await metaFetch(`/users/current/accounts/${encodeURIComponent(id)}/accountInformation`);
    if (!r.ok) return res.status(r.status).json({ ok: false, upstream: r.data, url: r.url });
    res.status(200).json(r.data || {});
  } catch (e) {
    res.status(502).json({ ok: false, error: 'upstream_error', details: String(e) });
  }
});

/** Stubs so WP routes don’t 404 while you wire trading calls later */
router.post('/accounts', (req, res) => res.status(501).json({ ok: false, error: 'not_implemented' }));
router.post('/order',   (req, res) => res.status(501).json({ ok: false, error: 'not_implemented' }));
router.post('/close',   (req, res) => res.status(501).json({ ok: false, error: 'not_implemented' }));
router.post('/modify',  (req, res) => res.status(501).json({ ok: false, error: 'not_implemented' }));

module.exports = router;
