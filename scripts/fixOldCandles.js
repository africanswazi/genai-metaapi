// scripts/fixOldCandles.js

const mysql = require('mysql2/promise');

async function main() {
  const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT || 3306,
  });

  const conn = await pool.getConnection();
  try {
    const [rows] = await conn.query('SELECT * FROM candle_cache');

    for (const row of rows) {
      let parsed;
      try {
        parsed = JSON.parse(row.candles_json);
        if (!Array.isArray(parsed)) continue;
      } catch {
        console.warn(`Skipping malformed JSON for ${row.symbol}`);
        continue;
      }

      const cleaned = parsed
        .map(c => {
          const t = c.datetime || c.time;
          const time = new Date(t).getTime();
          const open = parseFloat(c.open);
          const high = parseFloat(c.high);
          const low = parseFloat(c.low);
          const close = parseFloat(c.close);

          if (!isFinite(time) || !isFinite(open) || !isFinite(high) || !isFinite(low) || !isFinite(close)) {
            return null;
          }

          return {
            time: Math.floor(time / 1000),
            open, high, low, close
          };
        })
        .filter(Boolean);

      if (!cleaned.length) {
        console.warn(`No valid candles for ${row.symbol}`);
        continue;
      }

      const updatedJson = JSON.stringify(cleaned);

      await conn.query(
        `UPDATE candle_cache
         SET candles_json = ?, timestamp = CURRENT_TIMESTAMP
         WHERE user_email = ? AND symbol = ? AND \`interval\` = ?`,
        [updatedJson, row.user_email, row.symbol, row.interval]
      );

      console.log(`✅ Updated ${row.symbol} (${row.interval}) for ${row.user_email}`);
    }

  } catch (err) {
    console.error('Error:', err);
  } finally {
    conn.release();
    process.exit(0);
  }
}

main();
