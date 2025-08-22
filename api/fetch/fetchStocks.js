// api/fetch/fetchStocks.js
const fetch = require('node-fetch');
require('dotenv').config();

// Known stock tickers with correct exchange mappings
const STOCK_EXCHANGE_MAP = {
  AAPL: 'NASDAQ',
  MSFT: 'NASDAQ',
  GOOGL: 'NASDAQ',
  GOOG: 'NASDAQ',
  META: 'NASDAQ',
  AMZN: 'NASDAQ',
  NFLX: 'NASDAQ',
  NVDA: 'NASDAQ',
  TSLA: 'NASDAQ',
  AMD: 'NASDAQ',
  INTC: 'NASDAQ',
  BABA: 'NYSE',
  JPM: 'NYSE',
  GS: 'NYSE',
  'BRK.B': 'NYSE',
  DIS: 'NYSE',
  WMT: 'NYSE',
  T: 'NYSE',
  V: 'NYSE',
  MA: 'NYSE',
  PFE: 'NYSE',
  JNJ: 'NYSE',
  UNH: 'NYSE',
  XOM: 'NYSE',
  CVX: 'NYSE',
  KO: 'NYSE',
  PG: 'NYSE',
  PEPSI: 'NASDAQ'
  // Add more as needed
};

// Extract base ticker (e.g., strip suffix like :NASDAQ)
function cleanSymbol(raw) {
  return raw.replace(/:.*$/, '').toUpperCase();
}

function formatStock(symbol) {
  const base = cleanSymbol(symbol);
  const exchange = STOCK_EXCHANGE_MAP[base] || 'NYSE'; // Default to NYSE if unknown
  return `${base}:${exchange}`;
}

async function fetchStockCandles(symbol, interval = '1d') {
  const tdInterval = interval === '1d' ? '1day' : interval;
  const formatted = formatStock(symbol);
  const url = `https://api.twelvedata.com/time_series?symbol=${formatted}&interval=${tdInterval}&apikey=${process.env.TWELVE_DATA_API_KEY}&outputsize=1300`;

  try {
    console.log(`🔍 Fetching Stock data: ${url}`);
    const res = await fetch(url);
    const json = await res.json();

    if (!json || !json.values) {
      console.error(`❌ Twelve Data stock fetch failed for ${symbol}`, json);
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
    console.error(`❌ Stock fetch threw for ${symbol}:`, err.message);
    return [];
  }
}

module.exports = { fetchStockCandles, formatStock };
