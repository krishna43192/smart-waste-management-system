// Operations routes coordinate route planning and collection tracking.
const router = require('express').Router();
const c = require('./controller');
const directions = require('./directions.controller');

router.post('/routes/optimize', c.optimizeRoute);
router.get('/routes/by-city', c.getPlanByCity);
router.get('/routes/:truckId/today', c.getTodayRoute);
router.post('/collections', c.recordCollection);
router.get('/routes/:truckId/directions', directions.getPlanDirections);
router.get('/summary', c.getOpsSummary);
router.get('/bins', c.listBinsByCity);
router.get('/cities', c.listCities);

module.exports = router;
