/**
 * Connection parameters for the demo helpers that open their own database
 * connections (the I7 lock holder, the I8 seeder, the wait-events generator).
 * The same parameters as DatabaseService (server/database.js).
 */
const fs = require('fs');
const path = require('path');

/** Same connection parameters as DatabaseService (server/database.js). */
function adminClientConfig() {
  if (process.env.DATABASE_URL) {
    return {
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
    };
  }
  let dbPass = process.env.DB_PASSWORD;
  const passwordFile = path.join(__dirname, '../db/password.txt');
  if (!dbPass && fs.existsSync(passwordFile)) {
    try { dbPass = fs.readFileSync(passwordFile, 'utf8').trim(); } catch { /* fall through */ }
  }
  if (!dbPass) dbPass = 'orderup_secure_password_2025!';
  const config = {
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    database: process.env.DB_NAME || 'orderup',
    user: process.env.DB_USER || 'orderup_user',
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
  };
  config.password = dbPass;
  return config;
}

module.exports = { adminClientConfig };
