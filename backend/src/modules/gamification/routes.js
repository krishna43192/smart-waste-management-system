/**
 * Gamification Routes
 * Registers all API endpoints for the points and rewards system.
 */

const router = require("express").Router();
const c = require("./controller");

// Resident and Collector Routes

// GET /api/gamification/my-points?userId=xxx
// Get total points balance, rank, and available rewards for a user
router.get("/my-points", c.getMyPoints);

// GET /api/gamification/history?userId=xxx&page=1&limit=20
// Get full point transaction history for a user
router.get("/history", c.getHistory);

// GET /api/gamification/leaderboard?limit=10
// Get top residents and collectors ranked by total points
router.get("/leaderboard", c.getLeaderboard);

// GET /api/gamification/rewards?userId=xxx
// Get all available rewards with affordability status
router.get("/rewards", c.getRewards);

// POST /api/gamification/redeem
// Redeem points for a reward
// Body: { userId, rewardId }
router.post("/redeem", c.redeemPoints);

// Admin Routes

// GET /api/gamification/admin/summary
// Admin-only overview of all points activity
router.get("/admin/summary", c.getAdminSummary);

module.exports = router;