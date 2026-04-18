const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const routes = require('./routes');

const app = express();
app.disable('x-powered-by');
app.use(cors());
app.use(morgan('dev'));

// ✅ RAZORPAY WEBHOOK: needs raw body for HMAC-SHA256 signature verification.
// Must be registered BEFORE express.json() — once the body is parsed into an
// object the raw bytes are lost and signature verification will fail.
app.use('/api/billing/webhook', express.raw({ type: 'application/json' }));
app.use('/api/schedules/special/webhook', express.raw({ type: 'application/json' }));

app.use(express.json());

app.get('/health', (_req, res) => res.json({ ok: true }));
app.use('/api', routes);

app.use((err, req, res, next) => {
  console.error('API Error:', err);
  res.status(err.status || 500).json({
    ok: false,
    message: err.message || 'Internal server error',
  });
});

module.exports = app;