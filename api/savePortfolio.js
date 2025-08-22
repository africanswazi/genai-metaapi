// api/savePortfolio.js
const express = require('express');
const router = express.Router();
const mysql = require('mysql2/promise');
require('dotenv').config();

const pool = mysql.createPool({
  host:     process.env.DB_HOST,
  user:     process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
  port:     process.env.DB_PORT || 3306
});

// POST /api/savePortfolio
router.post('/', async (req, res) => {
  const { email, portfolio } = req.body;

  if (!email || !Array.isArray(portfolio)) {
    return res.status(400).json({ status: 'error', message: 'Invalid request body' });
  }

  try {
    const conn = await pool.getConnection();

    await conn.beginTransaction();

    // Delete previous portfolio
    await conn.query('DELETE FROM portfolio WHERE email = ?', [email]);

    // Insert each asset
    const insertQuery = `
      INSERT INTO portfolio (email, symbol, weight, exposure, cagr)
      VALUES (?, ?, ?, ?, ?)
    `;

    for (const asset of portfolio) {
      await conn.query(insertQuery, [
        email,
        asset.symbol,
        asset.weight,
        asset.exposure,
        asset.cagr
      ]);
    }

    await conn.commit();
    conn.release();

    res.json({ status: 'success' });
  } catch (err) {
    console.error('DB error:', err);
    res.status(500).json({ status: 'error', message: 'Database error' });
  }
});

module.exports = router;
