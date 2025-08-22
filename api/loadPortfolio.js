// api/loadPortfolio.js
const express = require('express');
const router = express.Router();
const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// Create MySQL connection pool
const pool = mysql.createPool({
  host:     process.env.DB_HOST,
  user:     process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
  port:     process.env.DB_PORT || 3306
});

// GET /api/loadPortfolio?email=someone@example.com
router.get('/', async (req, res) => {
  const { email } = req.query;

  if (!email) {
    return res.status(400).json({ status: 'error', message: 'Missing email' });
  }

  try {
    const [rows] = await pool.query(
      'SELECT symbol, weight, exposure, cagr FROM portfolio WHERE email = ?',
      [email]
    );

    res.json({ status: 'success', portfolio: rows });


  } catch (err) {
    const logPath = path.resolve(__dirname, '../loadPortfolio-error.log');
    const msg = `❌ Load Portfolio DB Error:\n${err.stack || err}\n\n`;
    fs.appendFileSync(logPath, msg);  // ✅ Write error to a log file

    console.error('❌ Load Portfolio DB Error:', err); // ✅ Still logs to terminal if visible
    res.status(500).json({ status: 'error', message: 'Database error' });
  }
});

module.exports = router;
