// api/fetch/fetchForex.js
const fetch = require('node-fetch');
require('dotenv').config();

async function fetchForexCandles(symbol, interval = '1d') {
  const tdInterval = interval === '1d' ? '1day' : interval;
  const formatted = /^[A-Z]{6}$/.test(symbol)
    ? `${symbol.slice(0, 3)}/${symbol.slice(3)}`
    : symbol;

  const url = `https://api.twelvedata.com/time_series?symbol=${formatted}&interval=${tdInterval}&apikey=${process.env.TWELVE_DATA_API_KEY}&outputsize=1300`;

  try {
    console.log(`🔍 Fetching forex data: ${url}`);
    const res = await fetch(url);
    const json = await res.json();

    if (!json || !json.values) {
      console.error(`❌ Twelve Data forex fetch failed for ${symbol}`, json);
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
    console.error(`❌ Forex fetch threw for ${symbol}:`, err.message);
    return [];
  }
}

module.exports = { fetchForexCandles };
