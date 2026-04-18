// Billing endpoints cover resident invoices and Razorpay checkout.
const router = require('express').Router();
const controller = require('./controller');

// ✅ WEBHOOK: raw body already captured by app.js before this is reached.
router.post('/webhook', controller.handleRazorpayWebhook);

router.get('/bills', controller.listBills);

// ✅ RAZORPAY: create an order on the backend, return orderId + keyId to frontend.
router.post('/create-order', controller.createOrder);

// ✅ RAZORPAY: frontend calls this after the Razorpay modal succeeds to verify
// the payment signature and mark the bill as paid.
router.post('/verify-payment', controller.verifyPayment);

router.get('/transactions/:transactionId/receipt', controller.getReceipt);
router.post('/simulate-pay', controller.simulatePayment);

module.exports = router;