// api/meta/index.js
const express = require('express');
const router = express.Router();

const METAAPI_BASE  = (process.env.METAAPI_BASE || 'https://api.metaapi.cloud').replace(/\/+$/, '');
const METAAPI_TOKEN = process.env.METAAPI_TOKEN || '';
const fetch = (global.fetch ? global.fetch.bind(global) : require('node-fetch'));

const ROUTER_VERSION = '2025-08-25T07:00Z'; // helps you verify deployment

function needToken(res) {
  if (!METAAPI_TOKEN) { res.status(500).json({ ok:false, error:'METAAPI_TOKEN not set' }); return true; }
  return false;
}

async function metaFetch(path, init = {}) {
  const url = METAAPI_BASE + path;
  const headers = Object.assign({
    'Authorization': `Bearer ${METAAPI_TOKEN}`,
    'auth-token': METAAPI_TOKEN,            // legacy header some setups still accept
    'Content-Type': 'application/json'
  }, init.headers || {});
  const resp = await fetch(url, { ...init, headers });
  const text = await resp.text();
  let data; try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }
  return { ok: resp.ok, status: resp.status, data, url };
}

// health + diag (to prove THIS router is live)
router.get('/health', (req, res) => {
  res.json({ ok:true, ts:Date.now(), node:process.version, hasMetaToken:!!METAAPI_TOKEN, metaBase:METAAPI_BASE, routerVersion: ROUTER_VERSION });
});
router.get('/diag', (req, res) => {
  const env = process.env;
  res.json({
    ok:true, routerVersion: ROUTER_VERSION,
    suspectedProxyEnv: {
      HTTP_PROXY: env.HTTP_PROXY||null, HTTPS_PROXY: env.HTTPS_PROXY||null, ALL_PROXY: env.ALL_PROXY||null, NO_PROXY: env.NO_PROXY||null,
      http_proxy: env.http_proxy||null, https_proxy: env.https_proxy||null, all_proxy: env.all_proxy||null, no_proxy: env.no_proxy||null,
      METAAPI_HTTP_PROXY: env.METAAPI_HTTP_PROXY||null,
    }
  });
});

// GET /api/meta/accounts  -> /users/current/accounts
router.get('/accounts', async (req, res) => {
  if (needToken(res)) return;
  try {
    const r = await metaFetch('/users/current/accounts');
    if (!r.ok) return res.status(r.status).json({ ok:false, upstream:r.data, url:r.url });
    res.json(r.data || []);
  } catch (e) { res.status(502).json({ ok:false, error:'upstream_error', details:String(e) }); }
});

// GET /api/meta/positions?accountId=ID  -> /users/current/accounts/{id}/positions
router.get('/positions', async (req, res) => {
  if (needToken(res)) return;
  const id = String(req.query.accountId||'').trim();
  if (!id) return res.status(400).json({ ok:false, error:'accountId is required' });
  try {
    const r = await metaFetch(`/users/current/accounts/${encodeURIComponent(id)}/positions`);
    if (!r.ok) return res.status(r.status).json({ ok:false, upstream:r.data, url:r.url });
    res.json(r.data || []);
  } catch (e) { res.status(502).json({ ok:false, error:'upstream_error', details:String(e) }); }
});

// GET /api/meta/info?accountId=ID  -> /users/current/accounts/{id}/accountInformation
router.get('/info', async (req, res) => {
  if (needToken(res)) return;
  const id = String(req.query.accountId||'').trim();
  if (!id) return res.status(400).json({ ok:false, error:'accountId is required' });
  try {
    const r = await metaFetch(`/users/current/accounts/${encodeURIComponent(id)}/accountInformation`);
    if (!r.ok) return res.status(r.status).json({ ok:false, upstream:r.data, url:r.url });
    res.json(r.data || {});
  } catch (e) { res.status(502).json({ ok:false, error:'upstream_error', details:String(e) }); }
});

// Stubs for later
router.post('/accounts', (req,res)=>res.status(501).json({ ok:false, error:'not_implemented' }));
router.post('/order',   (req,res)=>res.status(501).json({ ok:false, error:'not_implemented' }));
router.post('/close',   (req,res)=>res.status(501).json({ ok:false, error:'not_implemented' }));
router.post('/modify',  (req,res)=>res.status(501).json({ ok:false, error:'not_implemented' }));

module.exports = router;
