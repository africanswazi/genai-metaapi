/**
 * Minimal Express router to talk to Ava Online Web Services (AOWS) v3
 * We proxy from the browser -> this server -> AOWS so your API key & IP
 * whitelisting remain server-side and secure.
 *
 * Public endpoints:
 *   GET   /api/ava/health     – quick ping / config presence
 *   GET   /api/ava/mt5-link   – builds a web MT5 URL for iframe/popup
 *   POST  /api/ava/demo       – create demo account (TP/login, server id, SSO)
 *   POST  /api/ava/real       – create incomplete real account (redirect URL)
 *   OPTS  /api/ava/*          – CORS preflight (when called from front-ends)
 *
 * Accepted API key sources (in order):
 *   1) Authorization: Bearer <key>
 *   2) x-api-key: <key>
 *   3) process.env.AVATRade_API_KEY
 *
 * Required for AOWS calls:
 *   api_key header must be set to the key above.
 */

const express = require('express');
const router = express.Router();
const fetch = (...args) => import('node-fetch').then(({ default: f }) => f(...args));

const AOWS_BASE   = 'https://api.avaapi.net';
const MT5_WEB_URL = process.env.MT5_WEB_URL || 'https://web.metatrader.app/terminal?mode=demo&lang=en';

/* -------------------- small CORS helper (safe defaults) -------------------- */

function applyCors(req, res) {
  // You can tighten origins here (e.g., match your domain).
  const origin = req.headers.origin || '*';
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-api-key');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
}

/* -------------------- helpers -------------------- */

function getClientIp(req) {
  return (req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '')
    .toString().split(',')[0].trim();
}

function reqMeta(req) {
  return {
    ip_address: getClientIp(req),
    useragent:  req.headers['user-agent'] || '',
    referrer:   req.headers['referer'] || req.headers['referrer'] || '',
  };
}

/** Returns { key, source, aff, wl } or null if missing; also writes a 401 if missing */
function resolveApiKey(req, res) {
  let source = 'none';
  let key = null;

  // 1) Authorization: Bearer <key>
  const auth = (req.headers['authorization'] || '').trim();
  const m = auth.match(/^Bearer\s+(.+)$/i);
  if (m && m[1]) {
    key = m[1].trim();
    source = 'header:authorization';
  }

  // 2) x-api-key
  if (!key && req.headers['x-api-key']) {
    key = String(req.headers['x-api-key']).trim();
    if (key) source = 'header:x-api-key';
  }

  // 3) env
  if (!key && process.env.AVATRade_API_KEY) {
    key = String(process.env.AVATRade_API_KEY).trim();
    if (key) source = 'env:AVATRade_API_KEY';
  }

  if (!key) {
    res.status(401).json({ ok: false, error: 'AVATRade_API_KEY missing (no Authorization/x-api-key header and no env)' });
    return null;
  }

  return {
    key,
    source,
    aff: process.env.AVATRade_AFFILIATE_ID || '203693',
    wl : process.env.AVATRade_WHITELABEL   || 'AvaTrade'
  };
}

/** Normalize country to ISO-3166-1 alpha-2 if user sent a name */
function normalizeCountry(value) {
  if (!value) return value;
  const v = String(value).trim();
  // If already 2-letter, just uppercase it.
  if (/^[A-Za-z]{2}$/.test(v)) return v.toUpperCase();
  // Common fallbacks for a few frequent values (extend as needed)
  const map = {
    portugal: 'PT',
    canada: 'CA',
    southafrica: 'ZA',
    'south africa': 'ZA',
    unitedkingdom: 'GB',
    'united kingdom': 'GB',
    usa: 'US',
    'united states': 'US',
    germany: 'DE',
    france: 'FR',
    spain: 'ES',
    italy: 'IT',
  };
  const key = v.toLowerCase().replace(/\s+/g, '');
  return map[key] || v.slice(0, 2).toUpperCase(); // last resort: first two letters
}

function cleanPhone(s) {
  if (!s) return s;
  const t = String(s).replace(/[^\d+]/g, '');
  return t || String(s);
}

async function tryAows(path, key, payload) {
  const url = `${AOWS_BASE}${path}`;
  const r = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'api_key': key
    },
    body: JSON.stringify(payload)
  });
  const text = await r.text();
  let json = {};
  try { json = text ? JSON.parse(text) : {}; } catch { json = { raw: text }; }
  return { ok: r.ok, status: r.status, json };
}

/* -------------------- CORS preflight -------------------- */

router.options('/*', (req, res) => {
  applyCors(req, res);
  res.status(204).end();
});

/* -------------------- routes -------------------- */

/** Health */
router.get('/health', (req, res) => {
  applyCors(req, res);
  // resolveApiKey but don't error (we only want to report availability)
  const dummy = { status: () => ({ json: () => {} }) };
  const env = resolveApiKey(req, dummy) || { key: null, source: 'none' };
  res.json({
    ok: true,
    ts: Date.now(),
    aowsBase: AOWS_BASE,
    hasApiKey: !!env.key,
    apiKeySource: env.source || 'none',
    affiliateId: process.env.AVATRade_AFFILIATE_ID || '203693',
    whitelabel:  process.env.AVATRade_WHITELABEL   || 'AvaTrade',
    mt5WebUrl:   MT5_WEB_URL
  });
});

/**
 * Build MT5/MT4 web terminal link usable in an <iframe> or popup.
 * GET /api/ava/mt5-link?server=MetaQuotes-Demo&login=123456&lang=en&mode=demo&save=1
 */
router.get('/mt5-link', (req, res) => {
  applyCors(req, res);
  const { server = '', login = '', lang = 'en', mode = 'demo', save = '1' } = req.query || {};
  try {
    const url = new URL(MT5_WEB_URL);
    if (lang)   url.searchParams.set('lang', lang);
    if (mode)   url.searchParams.set('mode', mode);
    if (server) url.searchParams.set('server', server);
    if (login)  url.searchParams.set('login', login);
    if (save)   url.searchParams.set('save', save);
    return res.json({ ok: true, url: url.toString() });
  } catch (e) {
    return res.status(400).json({ ok: false, error: 'Invalid MT5_WEB_URL or params' });
  }
});

/** Create DEMO account */
router.post('/demo', async (req, res) => {
  applyCors(req, res);
  try {
    const env = resolveApiKey(req, res);
    if (!env) return;

    const {
      email, first_name, last_name, country, telephone,
      language = 'en', platform = 'MT5', currency = 'USD'
    } = req.body || {};

    if (!email || !first_name || !last_name || !country || !telephone) {
      return res.status(400).json({ ok: false, error: 'Missing required fields' });
    }

    const meta = reqMeta(req);
    const payload = {
      whitelabel: env.wl,
      email: String(email).trim(),
      first_name: String(first_name).trim(),
      last_name: String(last_name).trim(),
      language: String(language || 'en').trim(),
      referrer:   meta.referrer,
      ip_address: meta.ip_address,
      country:    normalizeCountry(country), // ISO-2
      affiliate_id: env.aff,
      telephone: cleanPhone(telephone),
      useragent:  meta.useragent,
      // optional tags
      custom1: String(platform || 'MT5').trim(),
      custom2: String(currency || 'USD').trim()
    };

    const { ok, status, json } = await tryAows('/api/aows/register/v3/demo', env.key, payload);
    if (!ok) return res.status(status).json({ ok: false, status, error: json || 'AVA error' });
    return res.json({ ok: true, data: json, keySource: env.source });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e?.message || 'Server error' });
  }
});

/** Start REAL account (KYC flow, returns redirect URL typically) */
router.post('/real', async (req, res) => {
  applyCors(req, res);
  try {
    const env = resolveApiKey(req, res);
    if (!env) return;

    const {
      email, first_name, last_name, country, telephone, language = 'en'
    } = req.body || {};

    if (!email || !first_name || !last_name || !country) {
      return res.status(400).json({ ok: false, error: 'Missing required fields' });
    }

    const meta = reqMeta(req);
    const payload = {
      whitelabel: env.wl,
      email: String(email).trim(),
      first_name: String(first_name).trim(),
      last_name: String(last_name).trim(),
      language: String(language || 'en').trim(),
      referrer:   meta.referrer,
      ip_address: meta.ip_address,
      country:    normalizeCountry(country),
      affiliate_id: env.aff,
      telephone: cleanPhone(telephone),
      useragent:  meta.useragent
    };

    const { ok, status, json } = await tryAows('/api/aows/register/v3/real', env.key, payload);
    if (!ok) return res.status(status).json({ ok: false, status, error: json || 'AVA error' });
    return res.json({ ok: true, data: json, keySource: env.source });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e?.message || 'Server error' });
  }
});

module.exports = router;
