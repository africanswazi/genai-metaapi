// server.js — minimal MetaApi-only server for Azure

require('dotenv').config();
const express = require('express');
const app = express();

// ---- Prefer IPv4 (Azure + Node 20) ----
try {
  const dns = require('dns');
  if (dns.setDefaultResultOrder) dns.setDefaultResultOrder('ipv4first');
} catch {}

// ---- Undici agent (for future use / TLS flags) ----
let dispatcher = null;
try {
  const { Agent } = require('undici');
  const insecure = String(process.env.METAAPI_INSECURE || '').trim() === '1';
  dispatcher = new Agent({
    connect: { rejectUnauthorized: !insecure }
  });
  // If you later need: globalThis.fetch = (url, opts={}) => fetch(url, { dispatcher, ...opts });
} catch {}

// ---- Basic middleware ----
app.disable('x-powered-by');
app.use(express.json({ limit: '1mb' }));

// ---- Health & root checks ----
app.get('/', (_req, res) => {
  res.json({
    ok: true,
    name: 'genai-metaapi',
    node: process.version,
    env: {
      has_METAAPI_TOKEN: !!process.env.METAAPI_TOKEN,
      region_hint: process.env.METAAPI_CLIENT_BASE || '',
    }
  });
});

// ---- Mount meta router on /api/meta (and a double-prefix safety) ----
const metaRouter = require('./api/meta');
app.use('/api/meta', metaRouter);
app.use('/api/api/meta', metaRouter); // in case your WP proxy double-prefixes

// ---- 404 for unknown API paths we care about ----
['/api/meta', '/api/api/meta', '/api/metaapi', '/api/api/metaapi']
  .forEach(prefix => {
    app.use(prefix, (req, res) => {
      res.status(404).json({ ok: false, error: 'not found', path: req.originalUrl });
    });
  });

// ---- Global error logging (Log Stream visibility) ----
process.on('unhandledRejection', e => console.error('UNHANDLED REJECTION', e));
process.on('uncaughtException', e => console.error('UNCAUGHT EXCEPTION', e));

// ---- Start ----
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`🚀 Azure server started on ${PORT}`);
});
