// api/meta.js
const express = require('express');
const router  = express.Router();
const https   = require('https');

// ---------- ENV & TLS/Agent ----------
const TOKEN = process.env.METAAPI_TOKEN || '';
const INSECURE = String(process.env.METAAPI_INSECURE || '').trim() === '1';

// allow Node native fetch to use a custom agent (skip TLS if requested)
const baseAgent = new https.Agent({ rejectUnauthorized: !INSECURE });

// optional proxy agent if you later set METAAPI_HTTP_PROXY (not required now)
let proxyAgent = null;
if (process.env.METAAPI_HTTP_PROXY) {
  try {
    const { HttpsProxyAgent } = require('https-proxy-agent');
    proxyAgent = new HttpsProxyAgent(process.env.METAAPI_HTTP_PROXY);
  } catch {}
}

const pickAgent = () => proxyAgent || baseAgent;

// global fetch shim
const fetchAny = (...args) =>
  (globalThis.fetch ? globalThis.fetch(...args) :
    import('node-fetch').then(({default: f}) => f(...args)));

const authHeaders = () => ({
  'Authorization': `Bearer ${TOKEN}`,
  'Content-Type': 'application/json'
});

// ---------- Bases & Prefixes (env-driven, with sane fallbacks) ----------
const REGION = (process.env.METAAPI_REGION || 'london').toLowerCase();

const CLIENT_BASES = [
  process.env.METAAPI_CLIENT_BASE || `https://mt-client-api-v1.${REGION}.agiliumtrade.ai`,
  'https://api.metaapi.cloud'
];

const CLIENT_PREFIXES = [
  process.env.METAAPI_CLIENT_PREFIX || '',   // some client hosts use no /v1
  '/v1'
];

const PROV_BASES = [
  process.env.METAAPI_PROVISIONING_BASE || 'https://api.metaapi.cloud', // aggregator is most reliable on shared hosts
  `https://mt-provisioning-api-v1.agiliumtrade.ai`
];

const PROV_PREFIXES = [
  process.env.METAAPI_PROVISIONING_PREFIX || '/provisioning/v1',
  '/provisioning'
];

// ---------- helpers ----------
async function tryFetch(url, init = {}) {
  const res = await fetchAny(url, { ...init, agent: pickAgent() });
  const text = await res.text();
  let json = null; try { json = JSON.parse(text); } catch {}
  return { ok: res.ok, status: res.status, text, json };
}

function joinUrl(base, prefix, path, q = '') {
  const b = base.replace(/\/+$/,'');
  const p = String(prefix || '').replace(/\/+$/,'');
  const s = path.replace(/^\/+/, '');
  const qp = q ? (q.startsWith('?') ? q : '?' + q) : '';
  return `${b}${p ? '/' + p.replace(/^\/+/, '') : ''}/${s}${qp}`;
}

// ---------- Debug routes ----------
router.get('/_debug', (req, res) => {
  res.json({
    ok: true,
    signature: 'meta-smart-dual-2025-08-22',
    TOKEN: !!TOKEN,
    TOKEN_LEN: TOKEN ? TOKEN.length : 0,
    REGION,
    INSECURE_TLS: INSECURE,
    CLIENT_BASES,
    CLIENT_PREFIXES,
    PROV_BASES,
    PROV_PREFIXES
  });
});

router.get('/_tls', (req, res) => {
  res.json({
    ok: true,
    INSECURE_TLS: INSECURE,
    agentType: proxyAgent ? 'HttpsProxyAgent' : 'https.Agent',
    PROXY_URL: process.env.METAAPI_HTTP_PROXY || null
  });
});

// ✅ NEW: quick env check for proxy-related variables
router.get('/_env', (req, res) => {
  const keys = [
    'METAAPI_HTTP_PROXY','HTTP_PROXY','HTTPS_PROXY','ALL_PROXY','NO_PROXY',
    'http_proxy','https_proxy','all_proxy','no_proxy'
  ];
  const out = {};
  keys.forEach(k => { out[k] = process.env[k] || ''; });
  res.json({ ok: true, proxies: out });
});

// Quick external & path probe
router.get('/_probe', async (req, res) => {
  const attempts = [];

  // Provisioning probes
  for (const b of PROV_BASES) {
    for (const p of PROV_PREFIXES) {
      const url = joinUrl(b, p, '/users/current/accounts');
      try {
        const r = await tryFetch(url, { headers: authHeaders() });
        attempts.push({ type:'prov', base:b, prefix:p, url, status:r.status, ok:r.ok, body: (r.text||'').slice(0, 400) });
        if (r.ok || r.status === 401 || r.status === 403) {
          return res.json({ ok: true, via: 'prov', url, status: r.status });
        }
      } catch (e) {
        attempts.push({ type:'prov', base:b, prefix:p, url, error: e.code || e.message });
      }
    }
  }

  // Client probes
  for (const b of CLIENT_BASES) {
    for (const p of CLIENT_PREFIXES) {
      const url = joinUrl(b, p, '/users/current/accounts');
      try {
        const r = await tryFetch(url, { headers: authHeaders() });
        attempts.push({ type:'client', base:b, prefix:p, url, status:r.status, ok:r.ok, body: (r.text||'').slice(0, 400) });
        if (r.ok || r.status === 401 || r.status === 403) {
          return res.json({ ok: true, via: 'client', url, status: r.status });
        }
      } catch (e) {
        attempts.push({ type:'client', base:b, prefix:p, url, error: e.code || e.message });
      }
    }
  }

  res.status(502).json({ ok:false, attempts });
});

// ---------- API: list accounts ----------
router.get('/accounts', async (req, res) => {
  if (!TOKEN) return res.status(400).json({ ok:false, error:'METAAPI_TOKEN missing' });

  const attempts = [];

  // Prefer Provisioning (authoritative list)
  for (const b of PROV_BASES) {
    for (const p of PROV_PREFIXES) {
      const url = joinUrl(b, p, '/users/current/accounts');
      try {
        const r = await tryFetch(url, { headers: authHeaders() });
        attempts.push({ base:b, prefix:p, url, status:r.status, ok:r.ok, short: (r.text||'').slice(0, 200) });
        if (r.ok && Array.isArray(r.json?.items || r.json)) {
          const items = Array.isArray(r.json) ? r.json : r.json.items;
          // optional: filter by ownerEmail tag
          const ownerEmail = String(req.query.ownerEmail || '').trim().toLowerCase();
          const filtered = ownerEmail
            ? items.filter(a => (a.tags || []).some(t => t.toLowerCase() === `owner:${ownerEmail}`))
            : items;
          return res.json({ ok:true, via:'prov', items: filtered });
        }
      } catch (e) {
        attempts.push({ base:b, prefix:p, url, error: e.code || e.message });
      }
    }
  }

  // Fallback to Client list (some tokens expose accounts here)
  for (const b of CLIENT_BASES) {
    for (const p of CLIENT_PREFIXES) {
      const url = joinUrl(b, p, '/users/current/accounts');
      try {
        const r = await tryFetch(url, { headers: authHeaders() });
        attempts.push({ base:b, prefix:p, url, status:r.status, ok:r.ok, short: (r.text||'').slice(0, 200) });
        if (r.ok && Array.isArray(r.json?.items || r.json)) {
          const items = Array.isArray(r.json) ? r.json : r.json.items;
          const ownerEmail = String(req.query.ownerEmail || '').trim().toLowerCase();
          const filtered = ownerEmail
            ? items.filter(a => (a.tags || []).some(t => t.toLowerCase() === `owner:${ownerEmail}`))
            : items;
          return res.json({ ok:true, via:'client', items: filtered });
        }
      } catch (e) {
        attempts.push({ base:b, prefix:p, url, error: e.code || e.message });
      }
    }
  }

  res.status(502).json({ ok:false, stage:'list', attempts });
});

// ---------- API: positions ----------
router.get('/positions', async (req, res) => {
  const accountId = String(req.query.accountId || '');
  if (!accountId) return res.status(400).json({ ok:false, error:'accountId required' });

  const attempts = [];
  for (const b of CLIENT_BASES) {
    for (const p of CLIENT_PREFIXES) {
      const url = joinUrl(b, p, `/users/current/accounts/${encodeURIComponent(accountId)}/positions`);
      try {
        const r = await tryFetch(url, { headers: authHeaders() });
        attempts.push({ base:b, prefix:p, url, status:r.status, ok:r.ok });
        if (r.ok) {
          const items = Array.isArray(r.json) ? r.json : (Array.isArray(r.json?.items) ? r.json.items : []);
          return res.json({ ok:true, items });
        }
      } catch (e) {
        attempts.push({ base:b, prefix:p, url, error: e.code || e.message });
      }
    }
  }
  res.status(502).json({ ok:false, stage:'positions', attempts });
});

// ---------- API: info (balance/equity etc.) ----------
router.get('/info', async (req, res) => {
  const accountId = String(req.query.accountId || '');
  if (!accountId) return res.status(400).json({ ok:false, error:'accountId required' });

  const attempts = [];
  for (const b of CLIENT_BASES) {
    for (const p of CLIENT_PREFIXES) {
      const url = joinUrl(b, p, `/users/current/accounts/${encodeURIComponent(accountId)}`);
      try {
        const r = await tryFetch(url, { headers: authHeaders() });
        attempts.push({ base:b, prefix:p, url, status:r.status, ok:r.ok });
        if (r.ok && r.json) return res.json({ ok:true, account: r.json });
      } catch (e) {
        attempts.push({ base:b, prefix:p, url, error: e.code || e.message });
      }
    }
  }
  res.status(502).json({ ok:false, stage:'info', attempts });
});

module.exports = router;
