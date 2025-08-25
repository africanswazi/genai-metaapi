// api/meta/index.js
const express = require('express');
const router  = express.Router();
const fetch   = globalThis.fetch || require('undici').fetch;

// ====== Config from Azure App Settings ======
const METAAPI_TOKEN = process.env.METAAPI_TOKEN || '';
const CLIENT_BASE   = process.env.METAAPI_CLIENT_BASE || 'https://mt-client-api-v1.london.agiliumtrade.ai';
const PROV_BASE     = process.env.METAAPI_PROVISIONING_BASE || 'https://mt-provisioning-api-v1.agiliumtrade.ai';

function authHeaders() {
  return {
    'Authorization': `Bearer ${METAAPI_TOKEN}`,
    'Content-Type': 'application/json'
  };
}

// ---- Debug endpoint: GET /api/meta/_debug ----
router.get('/_debug', (_req, res) => {
  res.json({
    ok: true,
    hasToken: !!METAAPI_TOKEN,
    tokenLen: METAAPI_TOKEN ? METAAPI_TOKEN.length : 0,
    clientBase: CLIENT_BASE,
    provBase: PROV_BASE,
  });
});

// ---- Accounts list: GET /api/meta/accounts ----
router.get('/accounts', async (_req, res) => {
  if (!METAAPI_TOKEN) return res.status(400).json({ ok:false, error: 'missing_METAAPI_TOKEN' });

  try {
    const url = `${CLIENT_BASE}/users/current/accounts`;
    const r = await fetch(url, { headers: authHeaders() });
    const text = await r.text();
    let body;
    try { body = JSON.parse(text); } catch { body = { raw: text }; }
    res.status(r.status).json(body);
  } catch (e) {
    res.status(502).json({ ok:false, error: 'fetch_failed', detail: String(e) });
  }
});

// ---- (Optional) Account state example: GET /api/meta/accountState?accountId=... ----
router.get('/accountState', async (req, res) => {
  const accountId = String(req.query.accountId || '').trim();
  if (!accountId) return res.status(400).json({ ok:false, error: 'accountId_required' });
  if (!METAAPI_TOKEN) return res.status(400).json({ ok:false, error: 'missing_METAAPI_TOKEN' });

  try {
    const url = `${CLIENT_BASE}/users/current/accounts/${encodeURIComponent(accountId)}/state`;
    const r = await fetch(url, { headers: authHeaders() });
    const body = await r.json().catch(() => ({}));
    res.status(r.status).json(body);
  } catch (e) {
    res.status(502).json({ ok:false, error:'fetch_failed', detail: String(e) });
  }
});

module.exports = router;
