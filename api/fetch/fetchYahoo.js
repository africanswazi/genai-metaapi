const yahooFinance = require('yahoo-finance2').default;

async function fetchYahooCandles(symbol, interval = '1d') {
  try {
    // 🧼 Strip :EXCHANGE (e.g., QQQT:NASDAQ → QQQT)
    const baseSymbol = symbol.split(':')[0].toUpperCase();

    // 🔍 DEBUG: Log the cleaned symbol actually sent to Yahoo
    console.log(`🧼 Cleaned symbol sent to Yahoo: ${baseSymbol}`);

    const yfInterval = interval === '1h' ? '60m' : '1d';
    const range = interval === '1h' ? '5d' : '1mo';

    console.log(`📡 Yahoo chart fetch → ${baseSymbol}, interval: ${yfInterval}, range: ${range}`);

    const result = await yahooFinance.chart(baseSymbol, {
      interval: yfInterval,
      range: range,
    });

    if (!result?.timestamp?.length || !result?.indicators?.quote?.[0]) {
      console.warn(`⚠️ No Yahoo Finance data for ${baseSymbol}`);
      return [];
    }

    const { timestamp } = result;
    const { open, high, low, close } = result.indicators.quote[0];

    return timestamp.map((t, i) => ({
      time: t * 1000,
      open: open[i],
      high: high[i],
      low: low[i],
      close: close[i],
    })).filter(c => c.close != null);

  } catch (err) {
    console.error(`❌ Yahoo fetch error for ${symbol} (${interval}):`, err.message);
    return [];
  }
}

module.exports = { fetchYahooCandles };
