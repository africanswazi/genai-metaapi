// api/meta/index.js
// Minimal MetaApi router used by server.js

const express = require('express');
const router = express.Router();

// ---- Config from env ----
const META_BASE = (process.env.METAAPI_BASE || 'https://api.metaapi.cloud').replace(/\/+$/, '');
const TOKEN     = process.env.METAAPI_TOKEN || '';

// helper: call MetaApi Cloud with Bearer auth
async function metaFetch(path, init = {}) {
  const url = `${META_BASE}${path}`;
  const headers = { 'Content-Type': 'application/json', ...(init.headers || {}) };
  if (TOKEN) headers.Authorization = `Bearer ${TOKEN}`;
  const opts = { method: 'GET', ...init, headers };

  const r = await fetch(url, opts);
  const text = await r.text();
  let data; try { data = JSON.parse(text); } catch { data = { raw: text }; }
  return { status: r.status, data, url };
}

// health for this router
router.get('/health', (req, res) => {
  res.json({ ok: true, ts: Date.now(), node: process.version, hasMetaToken: !!TOKEN, metaBase: META_BASE });
});

// GET /api/meta/accounts?ownerEmail=... (ownerEmail is ignored; MetaApi uses token)
router.get('/accounts', async (req, res) => {
  try {
    const out = await metaFetch('/users/current/accounts');
    res.status(out.status).json(out.data);
  } catch (e) {
    res.status(500).json({ ok:false, error:'upstream_error', message:e.message });
  }
});

// GET /api/meta/positions?accountId=...
router.get('/positions', async (req, res) => {
  const id = String(req.query.accountId || '').trim();
  if (!id) return res.status(400).json({ ok:false, error:'accountId required' });
  try {
    const out = await metaFetch(`/users/current/accounts/${encodeURIComponent(id)}/positions`);
    res.status(out.status).json(out.data);
  } catch (e) {
    res.status(500).json({ ok:false, error:'upstream_error', message:e.message });
  }
});

// GET /api/meta/info?accountId=...
router.get('/info', async (req, res) => {
  const id = String(req.query.accountId || '').trim();
  if (!id) return res.status(400).json({ ok:false, error:'accountId required' });
  try {
    const out = await metaFetch(`/users/current/accounts/${encodeURIComponent(id)}`);
    res.status(out.status).json(out.data);
  } catch (e) {
    res.status(500).json({ ok:false, error:'upstream_error', message:e.message });
  }
});

// POST /api/meta/order   { accountId, symbol, side, lots, sl?, tp? }
router.post('/order', async (req, res) => {
  const { accountId, symbol, side, lots, sl, tp } = req.body || {};
  if (!accountId || !symbol || typeof lots !== 'number') {
    return res.status(400).json({ ok:false, error:'accountId, symbol, lots are required' });
  }
  try {
    const body = { symbol, type:'POSITION', side:(String(side).toUpperCase()==='SELL'?'SELL':'BUY'), volume: lots };
    if (typeof sl === 'number') body.stopLoss = sl;
    if (typeof tp === 'number') body.takeProfit = tp;

    const out = await metaFetch(`/users/current/accounts/${encodeURIComponent(accountId)}/orders`, {
      method: 'POST', body: JSON.stringify(body)
    });
    res.status(out.status).json(out.data);
  } catch (e) {
    res.status(500).json({ ok:false, error:'upstream_error', message:e.message });
  }
});

// POST /api/meta/close   { accountId, positionId, lots? }
router.post('/close', async (req, res) => {
  const { accountId, positionId, lots } = req.body || {};
  if (!accountId || !positionId) return res.status(400).json({ ok:false, error:'accountId and positionId are required' });
  try {
    const body = { positionId };
    if (typeof lots === 'number') body.volume = lots;
    const out = await metaFetch(`/users/current/accounts/${encodeURIComponent(accountId)}/positions/${encodeURIComponent(positionId)}/close`, {
      method: 'POST', body: JSON.stringify(body)
    });
    res.status(out.status).json(out.data);
  } catch (e) {
    res.status(500).json({ ok:false, error:'upstream_error', message:e.message });
  }
});

// POST /api/meta/modify  { accountId, positionId, sl?, tp? }
router.post('/modify', async (req, res) => {
  const { accountId, positionId, sl, tp } = req.body || {};
  if (!accountId || !positionId) return res.status(400).json({ ok:false, error:'accountId and positionId are required' });
  if (typeof sl !== 'number' && typeof tp !== 'number') return res.status(400).json({ ok:false, error:'provide sl or tp' });
  try {
    const body = {};
    if (typeof sl === 'number') body.stopLoss = sl;
    if (typeof tp === 'number') body.takeProfit = tp;
    const out = await metaFetch(`/users/current/accounts/${encodeURIComponent(accountId)}/positions/${encodeURIComponent(positionId)}`, {
      method: 'PATCH', body: JSON.stringify(body)
    });
    res.status(out.status).json(out.data);
  } catch (e) {
    res.status(500).json({ ok:false, error:'upstream_error', message:e.message });
  }
});

// JSON 404 for this router
router.use((req, res) => res.status(404).json({ ok:false, error:'not_found', path:req.originalUrl }));

module.exports = router;
