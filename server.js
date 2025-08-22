// server.js — minimal MetaApi-only server for Azure

// 1) Load env
require('dotenv').config();

// 2) Nuke any proxy envs (some hosts inject these)
[
  'METAAPI_HTTP_PROXY','HTTP_PROXY','HTTPS_PROXY','ALL_PROXY','NO_PROXY',
  'http_proxy','https_proxy','all_proxy','no_proxy'
].forEach(k => { if (process.env[k]) delete process.env[k]; });

// 3) Prefer IPv4 AND configure Undici TLS from METAAPI_INSECURE
try {
  const dns = require('dns');
  if (dns.setDefaultResultOrder) dns.setDefaultResultOrder('ipv4first');

  // Node 20 fetch uses undici → set a global dispatcher that prefers IPv4
  // and optionally disables TLS verification when METAAPI_INSECURE=1
  const { setGlobalDispatcher, Agent } = require('undici');
  const insecure = String(process.env.METAAPI_INSECURE || '').trim() === '1';
  const lookupIPv4 = (hostname, _opts, cb) => dns.lookup(hostname, { family: 4 }, cb);

  setGlobalDispatcher(new Agent({
    connect: {
      lookup: lookupIPv4,
      rejectUnauthorized: !insecure
    }
  }));
} catch {}

// 4) Web app
const express = require('express');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3000;

app.set('trust proxy', true);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// 5) Health
app.get(['/','/health','/api/health','/api/api/health'], (req,res) =>
  res.json({ ok:true, ts: Date.now() })
);

// 6) MetaApi routes (only)
let metaRoutes;
try {
  metaRoutes = require('./api/meta'); // must export an express.Router()
} catch (e) {
  console.error('Failed to load ./api/meta:', e.message);
  // Tiny fallback router so the process still runs
  metaRoutes = express.Router();
  metaRoutes.all('*', (req,res) =>
    res.status(500).json({ ok:false, error:'meta router failed to load', details: e.message })
  );
}

// Mount under both base paths we use from WP
['/api/meta', '/api/api/meta', '/api/metaapi', '/api/api/metaapi']
  .forEach(prefix => app.use(prefix, metaRoutes));

// Alive pings for both bases
['/api/meta/_alive', '/api/api/meta/_alive', '/api/metaapi/_alive', '/api/api/metaapi/_alive']
  .forEach(p => app.get(p, (req,res)=>res.json({ ok:true, from:'server', path:p, ts:Date.now() })));

// JSON 404 inside the meta spaces (no HTML "Cannot GET")
['/api/meta', '/api/api/meta', '/api/metaapi', '/api/api/metaapi']
  .forEach(prefix => app.use(prefix, (req,res) =>
    res.status(404).json({ ok:false, error:'not found', path:req.originalUrl })
  ));

// 7) Start
app.listen(PORT, () => {
  console.log(`🚀 Azure server started on ${PORT}`);
});
