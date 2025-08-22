// api/fetch/fetchETF.js
const fetch = require('node-fetch');
require('dotenv').config();
const { cleanSymbol } = require('./utils/symbolUtils'); // ✅ Make sure this exists

async function fetchETFCandles(symbol, interval = '1d') {
  const tdInterval = interval === '1d' ? '1day' : interval;

  // ✅ Strip suffix (e.g. SPY:ARCA → SPY)
  const clean = cleanSymbol(symbol);  // e.g., 'SPY'
  const url = `https://api.twelvedata.com/time_series?symbol=${clean}&interval=${tdInterval}&apikey=${process.env.TWELVE_DATA_API_KEY}&outputsize=1300`;

  try {
    console.log(`🔍 Fetching ETF data: ${url}`);
    const res = await fetch(url);
    const json = await res.json();

    if (!json || json.status === 'error' || !Array.isArray(json.values)) {
      console.error(`❌ Twelve Data ETF fetch failed for ${clean}`, JSON.stringify(json));
      return [];
    }

    return json.values.map(c => ({
      time: Math.floor(new Date(c.datetime).getTime() / 1000),
      open: +c.open,
      high: +c.high,
      low: +c.low,
      close: +c.close,
    })).reverse();
  } catch (err) {
    console.error(`❌ ETF fetch threw for ${clean}:`, err.message);
    return [];
  }
}

module.exports = { fetchETFCandles };
