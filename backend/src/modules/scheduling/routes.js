// Special collection scheduling endpoints consumed by the resident portal.
const router = require('express').Router();
const controller = require('./controller');

router.get('/special/config', controller.getConfig);
router.post('/special/availability', controller.checkAvailability);
router.post('/special/payment/checkout', controller.startCheckout);
router.get('/special/payment/checkout/:sessionId', controller.syncCheckout);
router.post('/special/confirm', controller.confirmBooking);
router.get('/special/my', controller.listUserRequests);
router.get('/special/requests/:requestId/receipt', controller.downloadReceipt);

module.exports = router;
