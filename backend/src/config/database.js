const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

// log connection success
pool.on("connect", () => {
  console.log("✅ PostgreSQL connected");
});

// log errors
pool.on("error", (err) => {
  console.error("❌ PostgreSQL error:", err);
});

// query helper function
const query = (text, params) => {
  return pool.query(text, params);
};

module.exports = {
  query,
  pool
};