// api/meta/index.js — Meta endpoints (client API) with diagnostics

const express = require('express');
const router  = express.Router();
const fetch   = globalThis.fetch || require('undici').fetch;

// ====== Config ======
const METAAPI_TOKEN = process.env.METAAPI_TOKEN || '';
const CLIENT_BASE   = process.env.METAAPI_CLIENT_BASE || 'https://mt-client-api-v1.london.agiliumtrade.ai';
const PROV_BASE     = process.env.METAAPI_PROVISIONING_BASE || 'https://mt-provisioning-api-v1.agiliumtrade.ai';

function authHeaders() {
  return {
    'Authorization': `Bearer ${METAAPI_TOKEN}`,
    'Content-Type': 'application/json'
  };
}

// --- Lightweight ping: GET /api/meta/ping
router.get('/ping', (_req, res) => {
  res.json({ ok: true, ts: Date.now() });
});

// --- Debug (alias 1): GET /api/meta/_debug
router.get('/_debug', (_req, res) => {
  res.json({
    ok: true,
    hasToken: !!METAAPI_TOKEN,
    tokenLen: METAAPI_TOKEN ? METAAPI_TOKEN.length : 0,
    clientBase: CLIENT_BASE,
    provBase: PROV_BASE
  });
});

// --- Debug (alias 2): GET /api/meta/diag
router.get('/diag', (_req, res) => {
  res.json({
    ok: true,
    env: {
      has_METAAPI_TOKEN: !!METAAPI_TOKEN,
      METAAPI_CLIENT_BASE: CLIENT_BASE,
      METAAPI_PROVISIONING_BASE: PROV_BASE
    }
  });
});

// --- Accounts list: GET /api/meta/accounts
router.get('/accounts', async (_req, res) => {
  if (!METAAPI_TOKEN) {
    return res.status(400).json({ ok:false, error:'missing_METAAPI_TOKEN' });
  }

  try {
    const url = `${CLIENT_BASE}/users/current/accounts`;
    const r = await fetch(url, { headers: authHeaders() });
    const text = await r.text();
    let body;
    try { body = JSON.parse(text); } catch { body = { raw: text }; }

    // Pass through MetaApi status code
    res.status(r.status).json(body);
  } catch (e) {
    res.status(502).json({ ok:false, error:'fetch_failed', detail: String(e) });
  }
});

module.exports = router;
