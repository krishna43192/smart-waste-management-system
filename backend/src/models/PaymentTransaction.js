const { Schema, model, Types } = require('mongoose');

const TRANSACTION_STATUSES = Object.freeze(['pending', 'success', 'failed', 'cancelled']);

const schemaOptions = {
  timestamps: true,
  toJSON: { versionKey: false },
  toObject: { versionKey: false },
};

// Mirrors gateway interactions and their lifecycle for reconciliation.
const transactionSchema = new Schema({
  billId: { type: Types.ObjectId, ref: 'Bill', required: true, index: true },
  userId: { type: Types.ObjectId, ref: 'User', required: true, index: true },
  amount: { type: Number, required: true, min: 0 },
  currency: { type: String, default: 'LKR' },
  paymentMethod: { type: String },
  status: {
    type: String,
    enum: TRANSACTION_STATUSES,
    default: TRANSACTION_STATUSES[0],
    index: true,
  },
  stripeSessionId: { type: String, index: true },
  stripePaymentIntentId: { type: String },
  receiptUrl: { type: String },
  failureReason: { type: String },
  rawGatewayResponse: { type: Schema.Types.Mixed },
}, schemaOptions);

// Ensures efficient lookups for status filtering within a single bill.
transactionSchema.index({ billId: 1, status: 1, createdAt: -1 });

module.exports = model('PaymentTransaction', transactionSchema);
