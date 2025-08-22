const express = require('express');
const router = express.Router();
const mysql = require('mysql2/promise');
require('dotenv').config();

const { fetchCryptoCandles } = require('../fetch/fetchCrypto');
const { fetchForexCandles } = require('../fetch/fetchForex');
const { fetchETFCandles } = require('../fetch/fetchETF');
const { fetchStockCandles } = require('../fetch/fetchStocks');

const {
  cleanSymbol,
  formatForex,
  formatETF,
  formatStock,
  getSymbolType
} = require('../fetch/utils/symbolUtils');

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
  port: process.env.DB_PORT || 3306,
});

router.get('/', async (req, res) => {
  const { symbol, interval = '1d', user_email = '', force = 'false' } = req.query;
  if (!symbol) return res.status(400).json({ error: 'Missing symbol' });

  const type = getSymbolType(symbol);
  let formatted;

  switch (type) {
    case 'crypto': formatted = symbol; break;
    case 'forex': formatted = formatForex(symbol); break;
    case 'etf': formatted = formatETF(symbol); break;
    case 'stock':
    default: formatted = formatStock(symbol); break;
  }

  const dbKey = formatted.replace(/[:\/]/g, '').toUpperCase();

  console.log(`🛰️  Candle request → ${symbol}, interval: ${interval}, user: ${user_email}, force: ${force}`);
  console.log(`🔧 Formatted symbol: ${formatted}, DB Key: ${dbKey}`);

  let conn;
  try {
    conn = await pool.getConnection();

    const [rows] = await conn.query(
      'SELECT candles_json, timestamp FROM candle_cache WHERE user_email = ? AND symbol = ? AND `interval` = ?',
      [user_email, dbKey, interval]
    );

    const now = Date.now();
    const TTL = 23 * 60 * 60 * 1000;

    let isStale = true;
    if (rows.length > 0) {
      const ts = new Date(rows[0].timestamp).getTime();
      isStale = (now - ts > TTL);

      if (!isStale && force !== 'true') {
        const cached = JSON.parse(rows[0].candles_json);
        const fixed = cached.map(c => {
          const t = +c.time;
          return { ...c, time: t > 9999999999 ? Math.floor(t / 1000) : t };
        });

        if (fixed.some((c, i) => c.time !== cached[i].time)) {
          console.log(`🔧 Fixing millisecond timestamps for ${dbKey}`);
          await conn.query(
            `UPDATE candle_cache SET candles_json = ?, timestamp = CURRENT_TIMESTAMP
             WHERE user_email = ? AND symbol = ? AND \`interval\` = ?`,
            [JSON.stringify(fixed), user_email, dbKey, interval]
          );
        }

        console.log(`📦 Using cached data for ${dbKey} (fresh)`);
        return res.json(fixed);
      } else {
        console.log(`⏳ Cache for ${dbKey} is stale or force=true → fetching fresh data`);
      }
    }

    // 🔄 Fetch from API
    const candles = await fetchFromTwelveData(formatted, interval, type);
    if (!candles?.length) {
      console.warn(`❌ No candles returned from Twelve Data for ${formatted}`);
      return res.status(204).json({ warning: 'No candles returned' });
    }

    const sanitized = candles
      .map(c => {
        const t = c.datetime || c.time;
        const time = new Date(t).getTime();
        const open = parseFloat(c.open);
        const high = parseFloat(c.high);
        const low = parseFloat(c.low);
        const close = parseFloat(c.close);

        if (!isFinite(time) || !isFinite(open) || !isFinite(high) || !isFinite(low) || !isFinite(close)) {
          console.warn('⚠️ Skipping malformed candle:', c);
          return null;
        }

        return {
          time: Math.floor(time / 1000),
          open,
          high,
          low,
          close
        };
      })
      .filter(Boolean);

    if (!sanitized.length) {
      console.warn(`❌ All candles were invalid for ${formatted}`);
      return res.status(204).json({ warning: 'All candles invalid after sanitization' });
    }

    await conn.query(
      `INSERT INTO candle_cache (user_email, symbol, \`interval\`, candles_json)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE candles_json = VALUES(candles_json), timestamp = CURRENT_TIMESTAMP`,
      [user_email, dbKey, interval, JSON.stringify(sanitized)]
    );

    console.log(`✅ Fresh data saved to cache for ${dbKey}`);
    return res.json(sanitized);

  } catch (err) {
    console.error(`❌ Error for ${symbol}:`, err);
    return res.status(500).json({ error: err.message || 'Internal Server Error' });
  } finally {
    if (conn) conn.release();
  }
});


// 🔄 Dispatch logic for Twelve Data only
async function fetchFromTwelveData(formatted, interval, type) {
  try {
    switch (type) {
      case 'crypto': return await fetchCryptoCandles(formatted, interval);
      case 'forex': return await fetchForexCandles(formatted, interval);
      case 'etf': return await fetchETFCandles(formatted, interval);
      case 'stock':
      default: return await fetchStockCandles(formatted, interval);
    }
  } catch (err) {
    console.error(`❌ Twelve Data fetch error for ${formatted}:`, err.message);
    return null;
  }
}

module.exports = router;
