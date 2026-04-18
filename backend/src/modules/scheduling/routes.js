// Special collection scheduling endpoints consumed by the resident portal.
const router = require('express').Router();
const controller = require('./controller');

// ✅ RAZORPAY WEBHOOK: raw body captured by app.js.
router.post('/special/webhook', controller.handleRazorpayWebhook);

router.get('/special/config', controller.getConfig);
router.post('/special/availability', controller.checkAvailability);

// ✅ RAZORPAY: creates a Razorpay order and returns orderId + keyId to frontend.
router.post('/special/payment/checkout', controller.startCheckout);

// ✅ RAZORPAY: frontend calls this after modal succeeds to verify and finalise booking.
router.post('/special/payment/verify', controller.verifyCheckout);

router.post('/special/confirm', controller.confirmBooking);
router.get('/special/my', controller.listUserRequests);
router.get('/special/requests/:requestId/receipt', controller.downloadReceipt);

module.exports = router;