// Aggregates feature routers under the /api namespace.
const router = require('express').Router();

router.use('/ops', require('./modules/collectionOps/routes'));   // UC1
router.use('/schedules', require('./modules/scheduling/routes')); // UC2
router.use('/billing', require('./modules/billing/routes'));      // UC3
router.use('/analytics', require('./modules/analytics/routes'));  // UC4
router.use('/auth', require('./modules/auth/routes'));            // Auth
router.use('/gamification', require('./modules/gamification/routes'));

module.exports = router;
