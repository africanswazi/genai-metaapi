// ✅ Load environment variables first
require('dotenv').config();

// ----- hard-disable any proxy envs to avoid hijacked egress -----
[
  'METAAPI_HTTP_PROXY','HTTP_PROXY','HTTPS_PROXY','ALL_PROXY','NO_PROXY',
  'http_proxy','https_proxy','all_proxy','no_proxy'
].forEach((k) => { if (process.env[k]) delete process.env[k]; });


// Prefer IPv4 (shared hosts sometimes have flaky IPv6)
try {
  const dns = require('dns');
  if (dns.setDefaultResultOrder) dns.setDefaultResultOrder('ipv4first');
} catch {}
try {
  const { setGlobalDispatcher, Agent } = require('undici');
  const dns = require('dns');
  const lookupIPv4 = (hostname, opts, cb) => dns.lookup(hostname, { family: 4 }, cb);
  setGlobalDispatcher(new Agent({ connect: { lookup: lookupIPv4 } }));
} catch {}

const express = require('express');
const path = require('path');

const app  = express();
const PORT = process.env.PORT || 3000;

app.set('trust proxy', true);

// ⬇️ paper-trading engine
const { placeOrder, setStops, listPositions } = require('./api/orders');

// middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// health
app.get('/health',         (req,res)=>res.json({ok:true,ts:Date.now()}));
app.get('/api/health',     (req,res)=>res.json({ok:true,ts:Date.now()}));
app.get('/api/api/health', (req,res)=>res.json({ok:true,ts:Date.now()}));

// static (optional)
app.use(express.static(path.join(__dirname, 'public')));

// basic routes
app.use('/api/test',          (req,res)=>res.json({ok:true,msg:'✅ API test route hit!'}));
app.use('/api/candles',       require('./api/candles'));
app.use('/api/cagr',          require('./api/cagr'));
app.use('/api/loadPortfolio', require('./api/loadPortfolio'));
app.use('/api/savePortfolio', require('./api/savePortfolio'));

// AvaTrade proxy
const avaRoutes = require('./api/avaRoutes');
app.use('/api/ava',     avaRoutes);
app.use('/api/api/ava', avaRoutes);

// ─────────── MetaApi mounts (BOTH bases!) ───────────
const metaRoutes = require('./api/meta');   // <-- your meta.js router

// mount router at these prefixes
['/api/meta', '/api/api/meta', '/api/metaapi', '/api/api/metaapi']
  .forEach(prefix => app.use(prefix, metaRoutes));

// alive pings at both bases (independent of router internals)
['/api/meta/_alive', '/api/api/meta/_alive', '/api/metaapi/_alive', '/api/api/metaapi/_alive']
  .forEach(p => app.get(p, (req,res)=>res.json({ok:true,from:'server',path:p,ts:Date.now()})));

// JSON fallback inside meta spaces so you never see HTML "Cannot GET ..."
const metaFallback = (req,res)=>res.status(404).json({ok:false,from:'meta-fallback',method:req.method,path:req.originalUrl});
app.use('/api/meta',        metaFallback);
app.use('/api/api/meta',    metaFallback);
app.use('/api/metaapi',     metaFallback);
app.use('/api/api/metaapi', metaFallback);

// ─────────── paper trading endpoints ───────────
function bindTradingRoutes(prefix='') {
  app.post(`${prefix}/orders/place`, (req,res)=>{
    try {
      const { email='guest', symbol, side='BUY', qty, entry, sl, tp } = req.body || {};
      if (!symbol || qty===undefined || entry===undefined) return res.status(400).json({ok:false,error:'Bad order: symbol, qty, entry are required'});
      const position = placeOrder({
        email:String(email||'guest'),
        symbol:String(symbol).toUpperCase().trim(),
        side:(String(side).toUpperCase().trim()==='SELL'?'SELL':'BUY'),
        qty:+qty, entry:+entry,
        sl: sl!==undefined ? +sl : undefined,
        tp: tp!==undefined ? +tp : undefined,
      });
      res.json({ok:true,position});
    } catch (e) { console.error('placeOrder error:',e); res.status(500).json({ok:false,error:e?.message||String(e)}); }
  });

  app.post(`${prefix}/orders/stops`, (req,res)=>{
    try {
      const { email='guest', symbol, sl, tp } = req.body || {};
      if (!symbol) return res.status(400).json({ok:false,error:'symbol required'});
      const position = setStops({
        email:String(email||'guest'),
        symbol:String(symbol).toUpperCase().trim(),
        sl: sl!==undefined ? +sl : undefined,
        tp: tp!==undefined ? +tp : undefined,
      });
      if (!position) return res.status(404).json({ok:false,error:'position not found'});
      res.json({ok:true,position});
    } catch (e) { console.error('setStops error:',e); res.status(500).json({ok:false,error:e?.message||String(e)}); }
  });

  app.get(`${prefix}/orders`, (req,res)=>{
    try {
      const email = String(req.query.email || 'guest');
      const positions = listPositions(email);
      res.json({ok:true,positions});
    } catch (e) { console.error('listPositions error:',e); res.status(500).json({ok:false,error:e?.message||String(e)}); }
  });
}
bindTradingRoutes('');
bindTradingRoutes('/api');
bindTradingRoutes('/api/api');

// start
app.listen(PORT, ()=> {
  console.log(`🚀 Server running on port ${PORT}`);
});
