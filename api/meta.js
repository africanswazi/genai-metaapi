// api/meta.js  — MetaApi bridge for your dashboard (provisioning + client)
// Works with:
//   METAAPI_PROVISIONING_BASE=https://mt-provisioning-api-v1.agiliumtrade.agiliumtrade.ai
//   METAAPI_CLIENT_BASE=https://mt-client-api-v1.london.agiliumtrade.ai
//   METAAPI_TOKEN=<your metaapi auth token>
// Optional (you already set):
//   METAAPI_REGION=london
//   NO_PROXY / no_proxy to bypass proxies for *.agiliumtrade.ai / *.metaapi.cloud
//
// Endpoints exposed:
//   GET    /api/meta/_probe
//   GET    /api/meta/accounts                      (provisioning list)
//   POST   /api/meta/accounts                      (provisioning create)
//   POST   /api/meta/accounts/:id/deploy           (provisioning deploy)
//   DELETE /api/meta/accounts/:id                  (provisioning delete)
//   GET    /api/meta/accounts/:id/info             (client account-information)
//   GET    /api/meta/accounts/:id/positions        (client positions)
//   POST   /api/meta/accounts/:id/trade            (client trade passthrough)

const express = require('express');
const router  = express.Router();

router.use(express.json({ limit: '1mb' }));

// ---------- ENV ----------
const TOKEN  = (process.env.METAAPI_TOKEN || '').trim();
const PROV   = (process.env.METAAPI_PROVISIONING_BASE
  || 'https://mt-provisioning-api-v1.agiliumtrade.agiliumtrade.ai').replace(/\/+$/,'');
const CLIENT = (process.env.METAAPI_CLIENT_BASE
  || 'https://mt-client-api-v1.london.agiliumtrade.ai').replace(/\/+$/,'');
const REGION = (process.env.METAAPI_REGION || 'london').toLowerCase();

// ---------- Undici (Node 20) ----------
const { request, Agent, ProxyAgent } = require('undici');
const dns = require('dns');
const lookupIPv4 = (host, _opts, cb) => dns.lookup(host, { family: 4 }, cb);

// Per-host dispatcher so MetaApi traffic NEVER goes through any proxy.
const PROXY = (process.env.HTTPS_PROXY || process.env.HTTP_PROXY || '').trim();
const directAgent = new Agent({
  connect: { lookup: lookupIPv4, timeout: 15000, rejectUnauthorized: true },
  headersTimeout: 20000,
  bodyTimeout: 30000
});
const proxyAgent = PROXY ? new ProxyAgent(PROXY, { connect: { lookup: lookupIPv4 } }) : null;
const isMetaHost = h => h.endsWith('agiliumtrade.ai') || h.endsWith('metaapi.cloud');
function pickDispatcher(url) {
  try {
    const h = new URL(url).hostname;
    return (proxyAgent && !isMetaHost(h)) ? proxyAgent : directAgent;
  } catch {
    return directAgent;
  }
}

// ---------- Helpers ----------
function authHeaders(extra = {}) {
  const h = { 'auth-token': TOKEN, ...extra };
  return h;
}

async function hit(url, opts = {}) {
  const res = await request(url, {
    dispatcher: pickDispatcher(url),
    ...opts
  });
  const text = await res.body.text();
  let json = null;
  try { json = JSON.parse(text); } catch {}
  return { status: res.statusCode, headers: Object.fromEntries(res.headers), text, json };
}

function send(res, out) {
  const code = out.status || 200;
  const body = (out.json ?? out.text ?? '');
  // pass Retry-After if present (rate limits)
  const retryAfter = out.headers?.['retry-after'];
  if (retryAfter) res.set('Retry-After', retryAfter);
  if (typeof body === 'object') return res.status(code).json(body);
  try { return res.status(code).json(JSON.parse(body)); } catch { return res.status(code).send(body); }
}

// ---------- Routes ----------

// Connectivity probe (only the two hosts you use)
router.get('/_probe', async (req, res) => {
  const attempts = [];
  const targets = [
    { name: 'prov list',  url: `${PROV}/users/current/accounts` },
    { name: 'client ping', url: `${CLIENT}/users/current` }
  ];
  for (const t of targets) {
    try {
      const out = await hit(t.url, { method: 'GET', headers: authHeaders() });
      attempts.push({ name: t.name, url: t.url, status: out.status });
    } catch (e) {
      attempts.push({ name: t.name, url: t.url, error: e?.message || String(e) });
    }
  }
  res.json({ ok: attempts.some(a => a.status && a.status < 500), region: REGION, attempts });
});

// List accounts (Provisioning)
router.get('/accounts', async (req, res) => {
  try { send(res, await hit(`${PROV}/users/current/accounts`, { headers: authHeaders() })); }
  catch (e) { res.status(500).json({ error: 'proxy_error', message: e?.message || String(e) }); }
});

// Create account (Provisioning)
// If reliability not provided, default to "regular" to avoid the "top up" 403.
router.post('/accounts', async (req, res) => {
  const body = { reliability: 'regular', ...req.body };
  const txId = req.get('transaction-id') || require('crypto').randomBytes(16).toString('hex');
  try {
    send(res, await hit(`${PROV}/users/current/accounts`, {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json', 'transaction-id': txId }),
      body: JSON.stringify(body)
    }));
  } catch (e) {
    res.status(500).json({ error: 'proxy_error', message: e?.message || String(e) });
  }
});

// Deploy account (Provisioning)
router.post('/accounts/:id/deploy', async (req, res) => {
  try {
    send(res, await hit(`${PROV}/users/current/accounts/${req.params.id}/deploy`, {
      method: 'POST',
      headers: authHeaders()
    }));
  } catch (e) {
    res.status(500).json({ error: 'proxy_error', message: e?.message || String(e) });
  }
});

// Delete account (Provisioning)
router.delete('/accounts/:id', async (req, res) => {
  try {
    send(res, await hit(`${PROV}/users/current/accounts/${req.params.id}`, {
      method: 'DELETE',
      headers: authHeaders()
    }));
  } catch (e) {
    res.status(500).json({ error: 'proxy_error', message: e?.message || String(e) });
  }
});

// Account info (Client)
router.get('/accounts/:id/info', async (req, res) => {
  try {
    send(res, await hit(`${CLIENT}/users/current/accounts/${req.params.id}/account-information`, {
      headers: authHeaders()
    }));
  } catch (e) {
    res.status(500).json({ error: 'proxy_error', message: e?.message || String(e) });
  }
});

// Positions (Client)
router.get('/accounts/:id/positions', async (req, res) => {
  try {
    send(res, await hit(`${CLIENT}/users/current/accounts/${req.params.id}/positions`, {
      headers: authHeaders()
    }));
  } catch (e) {
    res.status(500).json({ error: 'proxy_error', message: e?.message || String(e) });
  }
});

// Trade passthrough (Client)
// Body is forwarded as-is to MetaApi; validate on your UI before calling.
router.post('/accounts/:id/trade', async (req, res) => {
  try {
    send(res, await hit(`${CLIENT}/users/current/accounts/${req.params.id}/trade`, {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(req.body || {})
    }));
  } catch (e) {
    res.status(500).json({ error: 'proxy_error', message: e?.message || String(e) });
  }
});

module.exports = router;
