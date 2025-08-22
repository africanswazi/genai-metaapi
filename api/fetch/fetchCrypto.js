const fetch = require('node-fetch');

const TWELVE_API_KEY = 'c3c8c95477bb458abb499deb4ef4d002';

const TWELVE_INTERVAL_MAP = {
  '1d': '1day',
  '1h': '1h',
  '4h': '4h',
  '1w': '1week',
};

function formatSymbol(sym) {
  if (sym.includes('/')) return sym;
  if (sym.endsWith('USDT')) return sym.replace('USDT', '/USD');
  if (sym.endsWith('BTC')) return sym.replace('BTC', '/BTC');
  return sym;
}

async function fetchCryptoCandles(symbol, interval = '1d') {
  const mappedInterval = TWELVE_INTERVAL_MAP[interval] || '1day';
  const limit = 1300;
  const formattedSymbol = formatSymbol(symbol);

  const url = `https://api.twelvedata.com/time_series?symbol=${formattedSymbol}&interval=${mappedInterval}&outputsize=${limit}&apikey=${TWELVE_API_KEY}`;

  try {
    console.log(`🔍 Fetching from Twelve Data: ${url}`);
    const res = await fetch(url);
    const json = await res.json();

    if (!json) {
      console.error('❌ Empty JSON response');
      return [];
    }

    if (json.status === 'error' || json.message) {
      console.error(`❌ Twelve Data error: ${json.message || 'Unknown error'}`);
      return [];
    }

    if (!Array.isArray(json.values)) {
      console.error('❌ Missing or invalid `values` array in response:', json);
      return [];
    }

    const candles = (json.values || []).map(c => {
      const time = c.datetime ? Math.floor(new Date(c.datetime).getTime() / 1000) : null;
      return time ? {
        time,
        open: +c.open,
        high: +c.high,
        low: +c.low,
        close: +c.close,
      } : null;
    }).filter(Boolean).reverse();

    console.log(`✅ Twelve Data returned ${candles.length} candles for ${formattedSymbol}`);
    return candles;
  } catch (err) {
    console.error(`❌ Exception while fetching Twelve Data for ${symbol}:`, err.message);
    return [];
  }
}

module.exports = { fetchCryptoCandles };
