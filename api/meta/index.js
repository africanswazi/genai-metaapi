// api/meta/index.js
const express = require('express');
const router = express.Router();

/** ========= Config (from env) =========
 * Keep these as App Settings in Azure:
 *   METAAPI_TOKEN                  = <your token>          (required)
 *   METAAPI_CLIENT_BASE            = https://mt-client-api-v1.london.agiliumtrade.ai   (or new-york)
 *   METAAPI_PROVISIONING_BASE      = https://mt-provisioning-api-v1.agiliumtrade.ai
 * Optional:
 *   METAAPI_INSECURE               = 0
 */
const METAAPI_TOKEN = process.env.METAAPI_TOKEN || '';
const CLIENT_BASE   = process.env.METAAPI_CLIENT_BASE || 'https://mt-client-api-v1.london.agiliumtrade.ai';
const PROV_BASE     = process.env.METAAPI_PROVISIONING_BASE || 'https://mt-provisioning-api-v1.agiliumtrade.ai';

function authHeaders(extra = {}) {
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${METAAPI_TOKEN}`,
    ...extra
  };
}

/** -------- Health / Diag -------- */
router.get('/health', (req, res) => {
  res.json({
    ok: true,
    ts: Date.now(),
    router: 'meta-router v3',
    hasMetaToken: !!METAAPI_TOKEN,
    clientBase: CLIENT_BASE,
    provisioningBase: PROV_BASE,
    node: process.version
  });
});

router.get('/diag', (req, res) => {
  res.json({
    ok: true,
    routerVersion: 'v3',
    env: {
      hasMetaToken: !!METAAPI_TOKEN,
      CLIENT_BASE,
      PROV_BASE,
      METAAPI_INSECURE: process.env.METAAPI_INSECURE || '0'
    },
    ipSeenByExpress: {
      ip: req.ip,
      ips: req.ips,
      xff: req.headers['x-forwarded-for'] || null
    }
  });
});

/** -------- Accounts (Provisioning API) --------
 * Lists accounts tied to the token.
 * Docs: https://metaapi.cloud/docs/client/restApi/api/provisioning/getAccounts/
 */
router.get('/accounts', async (req, res) => {
  if (!METAAPI_TOKEN) return res.status(500).json({ ok:false, error:'missing_token' });
  try {
    const r = await fetch(`${PROV_BASE}/users/current/accounts`, { headers: authHeaders() });
    const body = await r.json().catch(() => ({}));
    res.status(r.status).json(body);
  } catch (e) {
    res.status(502).json({ ok:false, error:'fetch_failed', detail: String(e) });
  }
});

/** -------- Positions (Client API) --------
 * Requires an accountId. CLIENT_BASE must match the account region (london or new-york).
 * Docs: https://metaapi.cloud/docs/client/restApi/api/readTradingTerminalState/readPositions/
 */
router.get('/positions', async (req, res) => {
  if (!METAAPI_TOKEN) return res.status(500).json({ ok:false, error:'missing_token' });
  const accountId = String(req.query.accountId || '').trim();
  if (!accountId) return res.status(400).json({ ok:false, error:'accountId_required' });

  try {
    const url = `${CLIENT_BASE}/users/current/accounts/${encodeURIComponent(accountId)}/positions`;
    const r = await fetch(url, { headers: authHeaders() });
    const body = await r.json().catch(() => ({}));
    res.status(r.status).json(body);
  } catch (e) {
    res.status(502).json({ ok:false, error:'fetch_failed', detail: String(e) });
  }
});

/** -------- Account info/state (Client API) --------
 * Returns terminal state snapshot for the account.
 */
router.get('/info', async (req, res) => {
  if (!METAAPI_TOKEN) return res.status(500).json({ ok:false, error:'missing_token' });
  const accountId = String(req.query.accountId || '').trim();
  if (!accountId) return res.status(400).json({ ok:false, error:'accountId_required' });

  try {
    const url = `${CLIENT_BASE}/users/current/accounts/${encodeURIComponent(accountId)}/state`;
    const r = await fetch(url, { headers: authHeaders() });
    const body = await r.json().catch(() => ({}));
    res.status(r.status).json(body);
  } catch (e) {
    res.status(502).json({ ok:false, error:'fetch_failed', detail: String(e) });
  }
});

module.exports = router;
