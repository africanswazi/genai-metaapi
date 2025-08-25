// api/meta/index.js
const express = require('express');
const router = express.Router();

const METAAPI_BASE  = (process.env.METAAPI_BASE || 'https://api.metaapi.cloud').replace(/\/$/, '');
const METAAPI_TOKEN = process.env.METAAPI_TOKEN || '';

function ensureToken(res) {
  if (!METAAPI_TOKEN) {
    res.status(500).json({ ok:false, error: 'METAAPI_TOKEN not set on server' });
    return false;
  }
  return true;
}

async function metaFetch(path, init = {}) {
  const url = METAAPI_BASE + path;
  const headers = Object.assign(
    { 'Authorization': `Bearer ${METAAPI_TOKEN}`, 'Content-Type': 'application/json' },
    init.headers || {}
  );
  const resp = await fetch(url, { ...init, headers });
  const text = await resp.text();
  let data;
  try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }
  return { ok: resp.ok, status: resp.status, data };
}

/** Health for this router (in addition to server-level health) */
router.get('/health', (req, res) => {
  res.json({
    ok: true,
    ts: Date.now(),
    node: process.version,
    hasMetaToken: !!METAAPI_TOKEN,
    metaBase: METAAPI_BASE
  });
});

/** GET /api/meta/accounts → MetaApi: /users/current/accounts */
router.get('/accounts', async (req, res) => {
  if (!ensureToken(res)) return;
  try {
    const r = await metaFetch('/users/current/accounts');
    res.status(r.status).json(r.data ?? { ok: r.ok });
  } catch (e) {
    res.status(502).json({ ok:false, error:'upstream_error', details:String(e) });
  }
});

/** GET /api/meta/positions?accountId=... → MetaApi: /users/current/accounts/{id}/positions */
router.get('/positions', async (req, res) => {
  if (!ensureToken(res)) return;
  const id = String(req.query.accountId || '').trim();
  if (!id) return res.status(400).json({ ok:false, error:'accountId is required' });
  try {
    const r = await metaFetch(`/users/current/accounts/${encodeURIComponent(id)}/positions`);
    res.status(r.status).json(r.data ?? { ok: r.ok });
  } catch (e) {
    res.status(502).json({ ok:false, error:'upstream_error', details:String(e) });
  }
});

/** GET /api/meta/info?accountId=... → MetaApi: /users/current/accounts/{id}/accountInformation */
router.get('/info', async (req, res) => {
  if (!ensureToken(res)) return;
  const id = String(req.query.accountId || '').trim();
  if (!id) return res.status(400).json({ ok:false, error:'accountId is required' });
  try {
    const r = await metaFetch(`/users/current/accounts/${encodeURIComponent(id)}/accountInformation`);
    res.status(r.status).json(r.data ?? { ok: r.ok });
  } catch (e) {
    res.status(502).json({ ok:false, error:'upstream_error', details:String(e) });
  }
});

/** Stubs so WP doesn’t 404 while you wire trading calls later */
router.post('/accounts', (req, res) => {
  res.status(501).json({ ok:false, error:'not_implemented', hint:'Create account via MetaApi SDK or REST here' });
});
router.post('/order',  (req,res)=> res.status(501).json({ ok:false, error:'not_implemented' }));
router.post('/close',  (req,res)=> res.status(501).json({ ok:false, error:'not_implemented' }));
router.post('/modify', (req,res)=> res.status(501).json({ ok:false, error:'not_implemented' }));

module.exports = router;
