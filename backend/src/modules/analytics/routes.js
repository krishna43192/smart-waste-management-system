// Routes expose reporting utilities consumed by the admin analytics dashboard.
const router = require('express').Router();
const controller = require('./controller');

/**
 * GET /analytics/config
 * 
 * Retrieves available filter options and default date ranges
 * for analytics report generation.
 * 
 * @route GET /api/analytics/config
 * @returns {Object} 200 - Configuration object with filters
 * @returns {Object} 500 - Internal server error
 */
router.get('/config', controller.getConfig);

/**
 * POST /analytics/report
 * 
 * Generates a comprehensive waste analytics report based on
 * user-provided criteria including date range, regions, waste types,
 * and billing models.
 * 
 * @route POST /api/analytics/report
 * @param {Object} body.userId - ID of the requesting user (required)
 * @param {Object} body.criteria - Report generation criteria (required)
 * @param {Object} body.criteria.dateRange - Date range object with from/to dates
 * @param {Array<String>} body.criteria.regions - Optional array of region filters
 * @param {Array<String>} body.criteria.wasteTypes - Optional array of waste type filters
 * @param {Array<String>} body.criteria.billingModels - Optional array of billing model filters
 * @returns {Object} 200 - Report data or null if no records found
 * @returns {Object} 400 - Invalid request criteria
 * @returns {Object} 401 - User not authenticated
 * @returns {Object} 403 - User not authorized for analytics
 * @returns {Object} 500 - Internal server error
 */
router.post('/report', controller.generateReport);

module.exports = router;

