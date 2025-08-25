// server.js — Azure App Service entrypoint (Node 20)

require('dotenv').config();
const express = require('express');
const app = express();

// --- Make sure Node binds on IPv4 first (Azure friendliness) ---
try {
  const dns = require('dns');
  if (typeof dns.setDefaultResultOrder === 'function') {
    dns.setDefaultResultOrder('ipv4first');
  }
} catch {}

// --- Force-disable any accidental proxy envs that can break Undici/Fetch ---
delete process.env.HTTP_PROXY;
delete process.env.http_proxy;
delete process.env.HTTPS_PROXY;
delete process.env.https_proxy;
delete process.env.NO_PROXY;
delete process.env.no_proxy;
delete process.env.METAAPI_HTTP_PROXY; // if previously set

// --- Build an Undici Agent that does NOT use a proxy ---
let dispatcher = null;
try {
  const { Agent } = require('undici');
  const insecure = String(process.env.METAAPI_INSECURE || '').trim() === '1';
  dispatcher = new Agent({
    connect: { rejectUnauthorized: !insecure }
  });

  // Enforce our dispatcher globally (avoids proxy pick-up from env)
  const undici = require('undici');
  undici.setGlobalDispatcher(dispatcher);
} catch (e) {
  console.warn('Undici agent not initialized:', e?.message || e);
}

// --- Basic express setup ---
app.disable('x-powered-by');
app.use(express.json({ limit: '1mb' }));

// --- Root health check ---
app.get('/', (_req, res) => {
  res.json({
    ok: true,
    name: 'genai-metaapi',
    node: process.version,
    env: {
      has_METAAPI_TOKEN: !!process.env.METAAPI_TOKEN,
      METAAPI_CLIENT_BASE: process.env.METAAPI_CLIENT_BASE || 'default:london',
      METAAPI_PROVISIONING_BASE: process.env.METAAPI_PROVISIONING_BASE || 'default:global',
      METAAPI_INSECURE: process.env.METAAPI_INSECURE || '0',
    }
  });
});

// --- Mount /api/meta router (and a safety double-prefix) ---
const metaRouter = require('./api/meta');
app.use('/api/meta', metaRouter);
app.use('/api/api/meta', metaRouter); // for accidental double-prefixing

// --- Explicit 404s for confusing paths to aid debugging ---
['/api/metaapi', '/api/api/metaapi'].forEach(prefix => {
  app.use(prefix, (req, res) => {
    res.status(404).json({ ok: false, error: 'not found', path: req.originalUrl });
  });
});

// --- Global error logging for Kudu Log Stream ---
process.on('unhandledRejection', e => console.error('UNHANDLED REJECTION', e));
process.on('uncaughtException', e => console.error('UNCAUGHT EXCEPTION', e));

// --- Start server ---
const PORT = process.env.PORT || 8080;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Azure server started on ${PORT}`);
});
