const express = require('express');
const router = express.Router();
const mysql = require('mysql2/promise');
const fetch = require('node-fetch');
require('dotenv').config();

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
  port: process.env.DB_PORT || 3306,
});

const WINDOW = 365 * 5; // 5 years

function computeCAGRwithDrag(closes) {
  if (closes.length < 100) return 0;
  const rets = [];
  for (let i = 1; i < closes.length; i++) {
    rets.push(Math.log(closes[i] / closes[i - 1]));
  }
  const mean = rets.reduce((a, b) => a + b, 0) / rets.length;
  const variance = rets.reduce((s, x) => s + (x - mean) ** 2, 0) / (rets.length - 1);
  return Math.exp(mean * 252 - 0.5 * variance * 252) - 1;
}

async function fetchCandles(symbol, interval = '1d', user_email = '') {
  const url = `https://tiankriek.com/api/candles?symbol=${symbol}&interval=${interval}&user_email=${encodeURIComponent(user_email)}`;
  try {
    const r = await fetch(url);
    const text = await r.text();

    if (!text.startsWith('[') && !text.startsWith('{')) {
      throw new Error(`Invalid JSON response:\n${text.substring(0, 80)}...`);
    }

    const j = JSON.parse(text);
    if (!Array.isArray(j) || j.length < 100) return null;

    return j.map(c => ({
      time: +c.time,
      close: +c.close
    }));
  } catch (err) {
    console.warn(`[CAGR] fetchCandles failed for ${symbol}:`, err.message);
    return null;
  }
}

router.get('/', async (req, res) => {
  const { symbol, interval = '1d', user_email = '' } = req.query;
  if (!symbol) return res.status(400).json({ status: 'error', message: 'Missing symbol' });

  console.log(`[CAGR] Request → ${symbol} | ${interval} | ${user_email}`);

  try {
    const conn = await pool.getConnection();

    // 1. Try from cache
    const [rows] = await conn.query(
      'SELECT cagr, updated_at FROM cagr_cache WHERE symbol = ? AND `interval` = ? AND user_email = ?',
      [symbol, interval, user_email]
    );

    if (rows.length > 0) {
      const { cagr, updated_at } = rows[0];
      const isRecent = Date.now() - new Date(updated_at).getTime() < 24 * 60 * 60 * 1000;
      if (isRecent) {
        conn.release();
        console.log('[CAGR] ✅ Returning from cache');
        return res.json({ status: 'success', cached: true, cagr });
      }
    }

    // 2. Fetch candles
    console.log('[CAGR] 📈 Fetching candles from internal API...');
    const candles = await fetchCandles(symbol, interval, user_email);

    if (!candles || candles.length < 100) {
  conn.release();
  console.warn(`[CAGR] ❌ Not enough candles for ${symbol}, returning 0`);
  return res.json({ status: 'success', cached: false, cagr: 0 });
}


    const closes = candles.slice(-WINDOW).map(o => o.close);
    const cagr = computeCAGRwithDrag(closes);

    // 3. Save to DB
    await conn.query(
      `INSERT INTO cagr_cache (symbol, \`interval\`, user_email, cagr)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE cagr = VALUES(cagr), updated_at = CURRENT_TIMESTAMP`,
      [symbol, interval, user_email, cagr]
    );

    conn.release();
    console.log('[CAGR] ✅ Computed and cached:', cagr);
    return res.json({ status: 'success', cached: false, cagr });
  } catch (err) {
    console.error('❌ [CAGR] Server error:', err.stack || err);
    return res.status(500).json({ status: 'error', message: err.message || 'Internal error' });
  }
});

module.exports = router;
