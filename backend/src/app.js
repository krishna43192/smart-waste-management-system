const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const routes = require('./routes');

// Builds the API app with common middleware before mounting feature routes.
const app = express();
app.disable('x-powered-by');
app.use(cors());
app.use(express.json());
app.use(morgan('dev'));

app.get('/health', (_req, res) => res.json({ ok: true }));
app.use('/api', routes);

// GLOBAL ERROR HANDLER (ADD THIS)
app.use((err, req, res, next) => {
  console.error('API Error:', err);

  res.status(err.status || 500).json({
    ok: false,
    message: err.message || 'Internal server error'
  });
});

module.exports = app;