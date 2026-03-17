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
  currency: { type: String, default: 'LKR' },
  status: {
    type: String,
    enum: PAYMENT_STATUSES,
    default: PAYMENT_STATUSES[0],
  },
  provider: { type: String, default: 'internal' },
  reference: { type: String },
  stripeSessionId: { type: String, index: true },
  slotId: { type: String, index: true },
  metadata: { type: Schema.Types.Mixed },
}, schemaOptions);

// Keeps recent payments per user readily available for audit or resend actions.
paymentSchema.index({ userId: 1, createdAt: -1 });
paymentSchema.index({ requestId: 1 });

module.exports = model('SpecialCollectionPayment', paymentSchema);
