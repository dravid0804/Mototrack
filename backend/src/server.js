// src/server.js

const dns = require("dns");
dns.setDefaultResultOrder("ipv4first");

require('dotenv').config();
const express     = require('express');
const cors        = require('cors');
const compression = require('compression');
const rateLimit   = require('express-rate-limit');
const path        = require('path');
const logger      = require('./config/logger');
const routes      = require('./routes');
const errorHandler = require('./middleware/errorHandler');

const app = express();
app.set('trust proxy', 1);   // tell Express it is behind a proxy (Render)

const START_PORT = parseInt(process.env.PORT) || 5000;

// ── Middleware ────────────────────────────────────────────────────────────
app.use(cors({ origin: '*', credentials: true }));
app.use(compression());
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true }));
app.use('/api', rateLimit({ windowMs: 15 * 60 * 1000, max: 500 }));

// ── Frontend static files ─────────────────────────────────────────────────
const frontendPath = path.join(__dirname, '..', '..', 'frontend');
app.use(express.static(frontendPath));

// ── API routes ────────────────────────────────────────────────────────────
app.use('/api', routes);

// ── Health check ──────────────────────────────────────────────────────────
app.get('/health', (req, res) => res.json({ status: 'ok', ts: new Date().toISOString() }));

// ── SPA fallback ──────────────────────────────────────────────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(frontendPath, 'index.html'), (err) => {
    if (err) res.status(404).send('Frontend not found');
  });
});

// ── Error handler ─────────────────────────────────────────────────────────
app.use(errorHandler);

// ── Auto-find free port and start ─────────────────────────────────────────
function startServer(port) {
  const server = app.listen(port, () => {
    console.log('\n\x1b[32m╔════════════════════════════════════╗\x1b[0m');
    console.log('\x1b[32m║   ✅  RevTrack is RUNNING!          ║\x1b[0m');
    console.log('\x1b[32m╠════════════════════════════════════╣\x1b[0m');
    console.log(`\x1b[32m║  Open: \x1b[33mhttp://localhost:${port}\x1b[32m       ║\x1b[0m`);
    console.log('\x1b[32m╚════════════════════════════════════╝\x1b[0m\n');
    require('./jobs/scheduler');
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.log(`\x1b[33m Port ${port} busy — trying ${port + 1}...\x1b[0m`);
      startServer(port + 1);
    } else {
      console.error('Server error:', err);
    }
  });
}

startServer(START_PORT);
module.exports = app;
