/**
 * Gamification Controller
 * Handles all points, rewards, leaderboard, and redemption logic.
 */

const mongoose = require('mongoose')
const Points = require('../../models/Points');
const { POINT_ACTIONS, POINT_VALUES } = require('../../models/Points');
const User = require('../../models/User');

// ─── Constants ────────────────────────────────────────────────────────────────

const REWARDS = [
  {
    id: 'bill_discount_10',
    title: '10% Bill Discount',
    description: 'Get 10% off your next waste collection bill',
    pointsRequired: 300,
    action: POINT_ACTIONS.REDEEMED_BILL_DISCOUNT,
    icon: '💳',
  },
  {
    id: 'free_pickup',
    title: 'Free Special Pickup',
    description: 'One free special collection pickup of your choice',
    pointsRequired: 500,
    action: POINT_ACTIONS.REDEEMED_FREE_PICKUP,
    icon: '🚛',
  },
]

const sendError = (res, status, message) =>
  res.status(status).json({ ok: false, message })

const sendSuccess = (res, data, message = 'Success') =>
  res.status(200).json({ ok: true, message, data })

// ─── Controller Functions ─────────────────────────────────────────────────────

/**
 * GET /api/gamification/my-points
 */
exports.getMyPoints = async (req, res) => {
  try {
    const userId = req.query.userId
    if (!userId) return sendError(res, 400, 'userId is required')

    const user = await User.findById(userId).select('name email role').lean()
    if (!user) return sendError(res, 404, 'User not found')

    const totalPoints = await Points.getTotalForUser(userId)

    const startOfMonth = new Date()
    startOfMonth.setDate(1)
    startOfMonth.setHours(0, 0, 0, 0)

    // FIX 1: new mongoose.Types.ObjectId() — works with all Mongoose versions
    const monthlyResult = await Points.aggregate([
      {
        $match: {
          userId: new mongoose.Types.ObjectId(userId),
          createdAt: { $gte: startOfMonth },
          points: { $gt: 0 },
        },
      },
      { $group: { _id: null, total: { $sum: '$points' } } },
    ])
    const pointsThisMonth = monthlyResult[0]?.total ?? 0

    const rankResult = await Points.aggregate([
      { $match: { role: user.role } },
      { $group: { _id: '$userId', totalPoints: { $sum: '$points' } } },
      { $sort: { totalPoints: -1 } },
    ])
    const rankIndex = rankResult.findIndex(r => r._id.toString() === userId)
    const rank = rankIndex === -1 ? null : rankIndex + 1

    const availableRewards = REWARDS.filter(r => totalPoints >= r.pointsRequired)

    return sendSuccess(res, {
      user: { name: user.name, email: user.email, role: user.role },
      points: { total: totalPoints, thisMonth: pointsThisMonth, rank },
      availableRewards,
      allRewards: REWARDS,
    })
  } catch (error) {
    console.error('getMyPoints error', error)
    return sendError(res, 500, 'Unable to fetch points')
  }
}

/**
 * GET /api/gamification/history
 */
exports.getHistory = async (req, res) => {
  try {
    const { userId, limit = 20, page = 1 } = req.query
    if (!userId) return sendError(res, 400, 'userId is required')

    const skip = (Number(page) - 1) * Number(limit)

    const transactions = await Points.find({ userId })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit))
      .lean()

    const total = await Points.countDocuments({ userId })

    const formatted = transactions.map(t => ({
      ...t,
      type: t.points > 0 ? 'earned' : 'spent',
      pointsDisplay: t.points > 0 ? `+${t.points}` : `${t.points}`,
      date: t.createdAt,
    }))

    return sendSuccess(res, {
      transactions: formatted,
      pagination: {
        total,
        page: Number(page),
        limit: Number(limit),
        totalPages: Math.ceil(total / Number(limit)),
      },
    })
  } catch (error) {
    console.error('getHistory error', error)
    return sendError(res, 500, 'Unable to fetch history')
  }
}

/**
 * GET /api/gamification/leaderboard
 */
exports.getLeaderboard = async (req, res) => {
  try {
    const { limit = 10 } = req.query

    const [topResidents, topCollectors] = await Promise.all([
      Points.getLeaderboard('resident', Number(limit)),
      Points.getLeaderboard('collector', Number(limit)),
    ])

    const withRank = list => list.map((item, index) => ({ ...item, rank: index + 1 }))

    return sendSuccess(res, {
      residents: withRank(topResidents),
      collectors: withRank(topCollectors),
    })
  } catch (error) {
    console.error('getLeaderboard error', error)
    return sendError(res, 500, 'Unable to fetch leaderboard')
  }
}

/**
 * GET /api/gamification/rewards
 */
exports.getRewards = async (req, res) => {
  try {
    const { userId } = req.query
    let totalPoints = 0
    if (userId) totalPoints = await Points.getTotalForUser(userId)

    const rewardsWithStatus = REWARDS.map(reward => ({
      ...reward,
      canRedeem: totalPoints >= reward.pointsRequired,
      pointsNeeded: Math.max(0, reward.pointsRequired - totalPoints),
    }))

    return sendSuccess(res, { rewards: rewardsWithStatus, currentPoints: totalPoints })
  } catch (error) {
    console.error('getRewards error', error)
    return sendError(res, 500, 'Unable to fetch rewards')
  }
}

/**
 * POST /api/gamification/redeem
 */
exports.redeemPoints = async (req, res) => {
  try {
    const { userId, rewardId } = req.body
    if (!userId || !rewardId) return sendError(res, 400, 'userId and rewardId are required')

    const reward = REWARDS.find(r => r.id === rewardId)
    if (!reward) return sendError(res, 404, 'Reward not found')

    const user = await User.findById(userId).lean()
    if (!user) return sendError(res, 404, 'User not found')

    // FIX 2: Block only admins — seeded users have role 'regular', not 'resident'
    if (user.role === 'admin') {
      return sendError(res, 403, 'Admins cannot redeem points')
    }

    const totalPoints = await Points.getTotalForUser(userId)
    if (totalPoints < reward.pointsRequired) {
      return sendError(res, 400, `Not enough points. You have ${totalPoints} pts but need ${reward.pointsRequired} pts`)
    }

    await Points.create({
      userId,
      role: 'resident',
      action: reward.action,
      points: -reward.pointsRequired,
      description: `Redeemed: ${reward.title}`,
      referenceType: 'redemption',
    })

    const newTotal = totalPoints - reward.pointsRequired

    return sendSuccess(res, {
      reward: reward.title,
      pointsSpent: reward.pointsRequired,
      remainingPoints: newTotal,
      message: `Successfully redeemed ${reward.title}!`,
    }, `Successfully redeemed ${reward.title}!`)
  } catch (error) {
    console.error('redeemPoints error', error)
    return sendError(res, 500, 'Unable to redeem points')
  }
}

/**
 * GET /api/gamification/admin/summary
 */
exports.getAdminSummary = async (req, res) => {
  try {
    const [
      totalPointsAwarded,
      totalPointsRedeemed,
      totalResidentsWithPoints,
      totalCollectorsWithPoints,
      recentTransactions,
    ] = await Promise.all([
      Points.aggregate([{ $match: { points: { $gt: 0 } } }, { $group: { _id: null, total: { $sum: '$points' } } }]),
      Points.aggregate([{ $match: { points: { $lt: 0 } } }, { $group: { _id: null, total: { $sum: '$points' } } }]),
      Points.distinct('userId', { role: 'resident' }),
      Points.distinct('userId', { role: 'collector' }),
      Points.find().sort({ createdAt: -1 }).limit(5).populate('userId', 'name email').lean(),
    ])

    return sendSuccess(res, {
      totalPointsAwarded: totalPointsAwarded[0]?.total ?? 0,
      totalPointsRedeemed: Math.abs(totalPointsRedeemed[0]?.total ?? 0),
      totalResidentsWithPoints: totalResidentsWithPoints.length,
      totalCollectorsWithPoints: totalCollectorsWithPoints.length,
      recentTransactions,
    })
  } catch (error) {
    console.error('getAdminSummary error', error)
    return sendError(res, 500, 'Unable to fetch admin summary')
  }
}