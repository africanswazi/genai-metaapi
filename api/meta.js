// api/meta.js
const express = require('express');
const router  = express.Router();

// ---------- ENV ----------
const TOKEN    = process.env.METAAPI_TOKEN || '';
const INSECURE = String(process.env.METAAPI_INSECURE || '').trim() === '1';
const REGION   = (process.env.METAAPI_REGION || 'london').toLowerCase();

// When insecure mode is on, make sure *all* TLS checks are relaxed
if (INSECURE) {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
}

// ---------- Undici dispatcher (preferred for Node 20 fetch) ----------
let localDispatcher = null;
let dispatcherType  = 'none';

try {
  const dns = require('dns');
  const { Agent, ProxyAgent } = require('undici');
  const lookupIPv4 = (host, _opts, cb) => dns.lookup(host, { family: 4 }, cb);

  if (process.env.METAAPI_HTTP_PROXY) {
    // Optional proxy support if you later set METAAPI_HTTP_PROXY
    localDispatcher = new ProxyAgent(process.env.METAAPI_HTTP_PROXY, {
      connect: { rejectUnauthorized: !INSECURE, lookup: lookupIPv4 }
    });
    dispatcherType = 'ProxyAgent';
  } else {
    localDispatcher = new Agent({
      connect: { rejectUnauthorized: !INSECURE, lookup: lookupIPv4 }
    });
    dispatcherType = 'Agent';
  }
} catch {
  // If undici isn't available for some reason, we just won't attach a dispatcher
  localDispatcher = null;
  dispatcherType  = 'none';
}

const pickDispatcher = () => localDispatcher || undefined;

// ---------- fetch shim (Node 20 has global fetch) ----------
const fetchAny = (...args) =>
  (globalThis.fetch ? globalThis.fetch(...args)
                    : import('node-fetch').then(({ default: f }) => f(...args)));

const authHeaders = () => ({
  'Authorization': `Bearer ${TOKEN}`,
  'Content-Type': 'application/json'
});

// ---------- Bases & Prefixes (env-driven, with sane fallbacks) ----------
const CLIENT_BASES = [
  process.env.METAAPI_CLIENT_BASE || `https://mt-client-api-v1.${REGION}.agiliumtrade.ai`,
  'https://api.metaapi.cloud'
];

const CLIENT_PREFIXES = [
  process.env.METAAPI_CLIENT_PREFIX || '',   // some client hosts use no /v1
  '/v1'
];

const PROV_BASES = [
  process.env.METAAPI_PROVISIONING_BASE || 'https://api.metaapi.cloud',
  'https://mt-provisioning-api-v1.agiliumtrade.ai'
];

const PROV_PREFIXES = [
  process.env.METAAPI_PROVISIONING_PREFIX || '/provisioning/v1',
  '/provisioning'
];

// ---------- helpers ----------
async function tryFetch(url, init = {}) {
  // Attach dispatcher for Undici fetch (ignored by node-fetch)
  const initWithDispatcher = (pickDispatcher())
    ? { ...init, dispatcher: pickDispatcher() }
    : init;

  const res  = await fetchAny(url, initWithDispatcher);
  const text = await res.text();
  let json = null; try { json = JSON.parse(text); } catch {}
  return { ok: res.ok, status: res.status, text, json };
}

function joinUrl(base, prefix, path, q = '') {
  const b  = base.replace(/\/+$/,'');
  const p  = String(prefix || '').replace(/\/+$/,'');
  const s  = path.replace(/^\/+/, '');
  const qp = q ? (q.startsWith('?') ? q : '?' + q) : '';
  return `${b}${p ? '/' + p.replace(/^\/+/, '') : ''}/${s}${qp}`;
}

// ---------- Debug routes ----------
router.get('/_debug', (req, res) => {
  res.json({
    ok: true,
    signature: 'meta-smart-dual-2025-08-22+undici',
    TOKEN: !!TOKEN,
    TOKEN_LEN: TOKEN ? TOKEN.length : 0,
    REGION,
    INSECURE_TLS: INSECURE,
    CLIENT_BASES,
    CLIENT_PREFIXES,
    PROV_BASES,
    PROV_PREFIXES,
    dispatcherType
  });
});

router.get('/_tls', (req, res) => {
  res.json({
    ok: true,
    INSECURE_TLS: INSECURE,
    dispatcherType,
    PROXY_URL: process.env.METAAPI_HTTP_PROXY || null
  });
});

// Quick env check for proxy-related variables
router.get('/_env', (req, res) => {
  const keys = [
    'METAAPI_HTTP_PROXY','HTTP_PROXY','HTTPS_PROXY','ALL_PROXY','NO_PROXY',
    'http_proxy','https_proxy','all_proxy','no_proxy'
  ];
  const out = {}; keys.forEach(k => out[k] = process.env[k] || '');
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

  // Fallback to Client list
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

// ---------- API: info ----------
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
