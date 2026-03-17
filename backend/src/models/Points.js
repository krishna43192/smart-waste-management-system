const mongoose = require('mongoose');

/**
 * Points Model
 * Stores every point transaction for residents and collectors.
 * Each document represents one earning or spending event.
 */

// All possible actions that can earn or spend points
const POINT_ACTIONS = {
  // Resident actions
  BILL_PAID: 'bill_paid',                     // +50 pts  - paid bill on time
  EARLY_PAYMENT: 'early_payment',             // +100 pts - paid before due date
  PICKUP_REQUESTED: 'pickup_requested',       // +30 pts  - requested special pickup
  PICKUP_CONFIRMED: 'pickup_confirmed',       // +50 pts  - showed up for pickup

  // Collector actions
  BIN_COLLECTED: 'bin_collected',             // +10 pts  - marked one bin as collected
  ROUTE_COMPLETED: 'route_completed',         // +100 pts - completed full route for the day
  ROUTE_COMPLETED_EARLY: 'route_completed_early', // +50 pts - completed route before time

  // Redemption actions (spending points)
  REDEEMED_BILL_DISCOUNT: 'redeemed_bill_discount',   // -500 pts
  REDEEMED_FREE_PICKUP: 'redeemed_free_pickup',       // -1000 pts
}

// Points value for each action
const POINT_VALUES = {
  [POINT_ACTIONS.BILL_PAID]: 50,
  [POINT_ACTIONS.EARLY_PAYMENT]: 100,
  [POINT_ACTIONS.PICKUP_REQUESTED]: 30,
  [POINT_ACTIONS.PICKUP_CONFIRMED]: 50,
  [POINT_ACTIONS.BIN_COLLECTED]: 10,
  [POINT_ACTIONS.ROUTE_COMPLETED]: 100,
  [POINT_ACTIONS.ROUTE_COMPLETED_EARLY]: 50,
  [POINT_ACTIONS.REDEEMED_BILL_DISCOUNT]: -500,
  [POINT_ACTIONS.REDEEMED_FREE_PICKUP]: -1000,
}

const pointsSchema = new mongoose.Schema(
  {
    // Which user earned/spent these points
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'userId is required'],
      index: true,
    },

    // Role of the user
    role: {
      type: String,
      enum: ['resident', 'collector', 'admin'],
      required: [true, 'role is required'],
    },

    // What action triggered this point transaction
    action: {
      type: String,
      enum: Object.values(POINT_ACTIONS),
      required: [true, 'action is required'],
    },

    // How many points (positive = earned, negative = spent)
    points: {
      type: Number,
      required: [true, 'points value is required'],
    },

    // Human readable description shown in history
    description: {
      type: String,
      required: [true, 'description is required'],
      maxlength: 200,
    },

    // Optional reference to the related document
    // e.g. billId, scheduleId, binId
    referenceId: {
      type: String,
      default: null,
    },

    // Optional reference type
    referenceType: {
      type: String,
      enum: ['bill', 'schedule', 'bin', 'route', 'redemption', null],
      default: null,
    },
  },
  {
    timestamps: true, // adds createdAt and updatedAt automatically
  }
)

// Index for fast leaderboard queries
pointsSchema.index({ userId: 1, createdAt: -1 })
pointsSchema.index({ role: 1, points: -1 })

/**
 * Static method to get total points for a user
 * Usage: await Points.getTotalForUser(userId)
 */
pointsSchema.statics.getTotalForUser = async function (userId) {
  const result = await this.aggregate([
    { $match: { userId: new mongoose.Types.ObjectId(userId) } },
    { $group: { _id: '$userId', total: { $sum: '$points' } } },
  ])
  return result[0]?.total ?? 0
}

/**
 * Static method to get leaderboard
 * Usage: await Points.getLeaderboard('resident', 10)
 */
pointsSchema.statics.getLeaderboard = async function (role, limit = 10) {
  return this.aggregate([
    { $match: { role } },
    { $group: { _id: '$userId', totalPoints: { $sum: '$points' } } },
    { $sort: { totalPoints: -1 } },
    { $limit: limit },
    {
      $lookup: {
        from: 'users',
        localField: '_id',
        foreignField: '_id',
        as: 'user',
      },
    },
    { $unwind: '$user' },
    {
      $project: {
        _id: 0,
        userId: '$_id',
        totalPoints: 1,
        name: '$user.name',
        email: '$user.email',
      },
    },
  ])
}

/**
 * Static method to award points easily
 * Usage: await Points.award({ userId, role, action, referenceId, referenceType })
 */
pointsSchema.statics.award = async function ({ userId, role, action, referenceId = null, referenceType = null }) {
  const points = POINT_VALUES[action]
  if (points === undefined) {
    throw new Error(`Unknown action: ${action}`)
  }

  const descriptions = {
    [POINT_ACTIONS.BILL_PAID]: 'Points awarded for paying bill on time',
    [POINT_ACTIONS.EARLY_PAYMENT]: 'Bonus points for paying bill early',
    [POINT_ACTIONS.PICKUP_REQUESTED]: 'Points awarded for requesting special pickup',
    [POINT_ACTIONS.PICKUP_CONFIRMED]: 'Points awarded for confirming pickup appointment',
    [POINT_ACTIONS.BIN_COLLECTED]: 'Points awarded for collecting a waste bin',
    [POINT_ACTIONS.ROUTE_COMPLETED]: 'Bonus points for completing full route today',
    [POINT_ACTIONS.ROUTE_COMPLETED_EARLY]: 'Bonus points for completing route ahead of schedule',
    [POINT_ACTIONS.REDEEMED_BILL_DISCOUNT]: 'Points redeemed for 10% bill discount',
    [POINT_ACTIONS.REDEEMED_FREE_PICKUP]: 'Points redeemed for free special pickup',
  }

  return this.create({
    userId,
    role,
    action,
    points,
    description: descriptions[action],
    referenceId,
    referenceType,
  })
}

const Points = mongoose.model('Points', pointsSchema)

module.exports = Points
module.exports.POINT_ACTIONS = POINT_ACTIONS
module.exports.POINT_VALUES = POINT_VALUES