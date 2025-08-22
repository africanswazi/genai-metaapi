const fetch = require('node-fetch');
require('dotenv').config();

const cache = new Map(); // Optional: in-memory cache

async function resolveExchangeForStock(symbol) {
  const cached = cache.get(symbol);
  if (cached) return cached;

  const url = `https://api.twelvedata.com/symbol_search?symbol=${symbol}&apikey=${process.env.TWELVE_DATA_API_KEY}`;

  try {
    const res = await fetch(url);
    const json = await res.json();

    if (!json || !json.data || !Array.isArray(json.data)) {
      console.warn(`❌ Exchange lookup failed for ${symbol}`);
      return `${symbol}:NYSE`; // fallback
    }

    const firstValid = json.data.find(
      d => d.instrument_type === 'Common Stock' || d.instrument_type === 'ETF'
    );

    const fullSymbol = firstValid ? `${symbol}:${firstValid.exchange}` : `${symbol}:NYSE`;

    // Cache result
    cache.set(symbol, fullSymbol);
    return fullSymbol;

  } catch (err) {
    console.error(`❌ Error resolving exchange for ${symbol}:`, err.message);
    return `${symbol}:NYSE`; // fallback
  }
}

module.exports = { resolveExchangeForStock };
