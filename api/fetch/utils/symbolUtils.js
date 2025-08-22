const knownCryptoTickers = [
  'APE', 'ARB', 'ADA', 'AAVE', 'AVAX', 'ATOM', 'BNB', 'BCH', 'BTC',
  'CAKE', 'DOGE', 'DOT', 'EGLD', 'ETH', 'ETC', 'FIL', 'FTM', 'GRT',
  'IMX', 'ICP', 'JASMY', 'LINK', 'LTC', 'MATIC', 'NEAR', 'PEPE', 'RNDR',
  'SHIB', 'SOL', 'SAND', 'TRX', 'UNI', 'VET', 'XLM', 'XRP'
];

const ETF_EXCHANGE_MAP = {
  VIXY: 'CBOE',
  SPY: 'ARCA',
  QQQ: 'NASDAQ',
  IWM: 'ARCA',
};

const STOCK_EXCHANGE_MAP = {
  AAPL: 'NASDAQ',
  AMD: 'NASDAQ',
  AMZN: 'NASDAQ',
  BABA: 'NYSE',
  BRK: 'NYSE',
  'BRK.B': 'NYSE',
  CVX: 'NYSE',
  DIS: 'NYSE',
  GOOGL: 'NASDAQ',
  GOOG: 'NASDAQ',
  GS: 'NYSE',
  INTC: 'NASDAQ',
  JNJ: 'NYSE',
  JPM: 'NYSE',
  KO: 'NYSE',
  MA: 'NYSE',
  META: 'NASDAQ',
  MSFT: 'NASDAQ',
  NFLX: 'NASDAQ',
  NVDA: 'NASDAQ',
  PEP: 'NASDAQ',
  PFE: 'NYSE',
  PG: 'NYSE',
  T: 'NYSE',
  TSLA: 'NASDAQ',
  UNH: 'NYSE',
  V: 'NYSE',
  WMT: 'NYSE',
  XOM: 'NYSE'
};

// Ensure that symbols ending in 'T' (like QQQT) are automatically mapped to NASDAQ
const getExchangeForSymbol = (symbol) => {
  // Check if the symbol ends with 'T' (indicating NASDAQ)
  if (symbol.endsWith('T')) {
    return 'NASDAQ';
  }

  const base = cleanSymbol(symbol);
  return STOCK_EXCHANGE_MAP[base] || 'NASDAQ'; // Default to NASDAQ if not found
};

const cleanSymbol = raw => (raw || '').replace(/:.*$/, '').toUpperCase();

function isCrypto(symbol = '') {
  const clean = symbol.replace(/[:\-\/]/g, '').toUpperCase();
  const base = clean.replace(/(USDT|USD|BTC)$/, '');
  return knownCryptoTickers.includes(base);
}

function formatETF(symbol) {
  const base = cleanSymbol(symbol);
  const exchange = ETF_EXCHANGE_MAP[base];
  return exchange ? `${base}:${exchange}` : null;
}

function formatStock(symbol) {
  const base = cleanSymbol(symbol);
  const exchange = getExchangeForSymbol(base);  // Use the dynamic exchange logic
  return `${base}:${exchange}`;
}

function formatForex(symbol) {
  if (symbol.includes('/')) return symbol;
  const clean = cleanSymbol(symbol);
  return /^[A-Z]{6}$/.test(clean) ? `${clean.slice(0, 3)}/${clean.slice(3)}` : clean;
}

function getSymbolType(symbol = '') {
  if (isCrypto(symbol)) return 'crypto';
  if (/^[A-Z]{6}$/.test(cleanSymbol(symbol))) return 'forex';
  if (ETF_EXCHANGE_MAP[cleanSymbol(symbol)]) return 'etf';
  return 'stock';
}

module.exports = {
  cleanSymbol,
  ETF_EXCHANGE_MAP,
  formatETF,
  formatForex,
  formatStock,
  isCrypto,
  knownCryptoTickers,
  STOCK_EXCHANGE_MAP,
  getSymbolType,
  getExchangeForSymbol
};
