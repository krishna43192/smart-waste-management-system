const { Schema, model, Types } = require('mongoose');

const PAYMENT_STATUSES = Object.freeze(['pending', 'success', 'failed']);

const schemaOptions = {
  timestamps: true,
  toJSON: { versionKey: false },
  toObject: { versionKey: false },
};

// Persisted snapshot of payments captured during special collections.
const paymentSchema = new Schema({
  requestId: { type: Types.ObjectId, ref: 'SpecialCollectionRequest' },
  userId: { type: Types.ObjectId, ref: 'User', required: true },
  amount: { type: Number, required: true, min: 0 },
  currency: { type: String, default: 'INR' },
  status: {
    type: String,
    enum: PAYMENT_STATUSES,
    default: PAYMENT_STATUSES[0],
  },
  provider: { type: String, default: 'internal' },
  reference: { type: String },

  // ✅ RAZORPAY fields (replaces stripeSessionId)
  razorpayOrderId: { type: String, index: true },
  razorpayPaymentId: { type: String },

  slotId: { type: String, index: true },
  metadata: { type: Schema.Types.Mixed },
}, schemaOptions);

paymentSchema.index({ userId: 1, createdAt: -1 });
paymentSchema.index({ requestId: 1 });

module.exports = model('SpecialCollectionPayment', paymentSchema);