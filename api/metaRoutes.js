const express = require('express');
const router  = express.Router();

const METAAPI_BASE  = process.env.METAAPI_BASE || 'https://api.metaapi.cloud';
const METAAPI_TOKEN = process.env.METAAPI_TOKEN || '';

const authHeaders = () => ({
  'Authorization': `Bearer ${METAAPI_TOKEN}`,
  'Content-Type': 'application/json'
});

// ---- quick debug endpoint
router.get('/_debug', (req, res) => {
  res.json({
    ok: true,
    METAAPI_BASE,
    hasToken: !!METAAPI_TOKEN,
    tokenLen: METAAPI_TOKEN ? METAAPI_TOKEN.length : 0
  });
});

// GET /api/meta/accounts?ownerEmail=...
router.get('/accounts', async (req, res) => {
  try {
    const r = await fetch(`${METAAPI_BASE}/users/current/accounts`, { headers: authHeaders() });
    const txt = await r.text();
    let j; try { j = JSON.parse(txt); } catch { j = null; }

    if (!r.ok) {
      return res.status(r.status).json({
        ok: false,
        metaStatus: r.status,
        metaBody: txt?.slice(0, 600) || '(no body)'
      });
    }

    let items = Array.isArray(j) ? j : (Array.isArray(j?.items) ? j.items : []);
    const ownerEmail = String(req.query.ownerEmail || '').trim().toLowerCase();
    if (ownerEmail) {
      items = items.filter(a => (a.tags || []).some(t => t.toLowerCase() === `owner:${ownerEmail}`));
    }
    res.json({ ok: true, items });
  } catch (e) {
    console.error('[meta/accounts] error', e);
    res.status(500).json({ ok:false, error: e?.message || String(e) });
  }
});

// POST /api/meta/accounts
router.post('/accounts', async (req, res) => {
  try {
    const p = req.body || {};
    const ownerEmail = String(p.ownerEmail || 'guest').toLowerCase();
    if (!p.server || !p.login || !p.password) {
      return res.status(400).json({ ok:false, error:'server, login, password are required' });
    }

    const payload = {
      name: p.label || `${(p.platform || 'MT5').toUpperCase()} ${p.login}`,
      type: 'cloud',
      platform: (p.platform || 'MT5').toLowerCase(), // mt4|mt5
      login: String(p.login),
      password: String(p.password),
      server: String(p.server),
      magic: 0,
      tags: [
        `owner:${ownerEmail}`,
        ...(p.affiliateCode ? [`aff:${String(p.affiliateCode)}`] : []),
        ...(p.label ? [`label:${String(p.label)}`] : [])
      ]
    };

    const r1 = await fetch(`${METAAPI_BASE}/users/current/accounts`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(payload)
    });
    const txt = await r1.text();
    let acc; try { acc = JSON.parse(txt); } catch { acc = null; }
    if (!r1.ok) {
      return res.status(r1.status).json({
        ok:false, stage:'create', metaStatus:r1.status, metaBody: txt?.slice(0, 600) || '(no body)'
      });
    }

    const id = acc.id || acc._id;
    if (id) {
      const r2 = await fetch(`${METAAPI_BASE}/users/current/accounts/${id}/deploy`, {
        method: 'POST',
        headers: authHeaders()
      });
      if (!r2.ok) {
        const dTxt = await r2.text();
        return res.status(202).json({
          ok:true,
          account: acc,
          deploy: { ok:false, metaStatus:r2.status, metaBody: dTxt?.slice(0, 600) || '(no body)' }
        });
      }
    }

    res.json({ ok:true, account: acc });
  } catch (e) {
    console.error('[meta/accounts POST] error', e);
    res.status(500).json({ ok:false, error: e?.message || String(e) });
  }
});

// GET /api/meta/positions?accountId=...
router.get('/positions', async (req, res) => {
  try {
    const accountId = String(req.query.accountId || '');
    if (!accountId) return res.status(400).json({ ok:false, error:'accountId required' });

    const r = await fetch(`${METAAPI_BASE}/users/current/accounts/${accountId}/positions`, {
      headers: authHeaders()
    });
    const txt = await r.text();
    let j; try { j = JSON.parse(txt); } catch { j = null; }

    if (!r.ok) {
      return res.status(r.status).json({
        ok:false, metaStatus:r.status, metaBody: txt?.slice(0, 600) || '(no body)'
      });
    }

    res.json({ ok:true, items: Array.isArray(j) ? j : (Array.isArray(j?.items) ? j.items : []) });
  } catch (e) {
    console.error('[meta/positions] error', e);
    res.status(500).json({ ok:false, error: e?.message || String(e) });
  }
});

// GET /api/meta/info?accountId=...
router.get('/info', async (req, res) => {
  try {
    const accountId = String(req.query.accountId || '');
    if (!accountId) return res.status(400).json({ ok:false, error:'accountId required' });

    const r = await fetch(`${METAAPI_BASE}/users/current/accounts/${accountId}`, {
      headers: authHeaders()
    });
    const txt = await r.text();
    let j; try { j = JSON.parse(txt); } catch { j = null; }
    if (!r.ok) {
      return res.status(r.status).json({
        ok:false, metaStatus:r.status, metaBody: txt?.slice(0, 600) || '(no body)'
      });
    }
    res.json({ ok:true, account: j });
  } catch (e) {
    console.error('[meta/info] error', e);
    res.status(500).json({ ok:false, error: e?.message || String(e) });
  }
});

module.exports = router;
