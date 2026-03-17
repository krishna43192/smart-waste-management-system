const { Schema, model, Types } = require('mongoose');

// Enumerations keep downstream validation consistent between controllers and persistence.
const BILL_CATEGORIES = Object.freeze(['residential', 'special-collection']);
const BILL_STATUSES = Object.freeze(['unpaid', 'paid', 'cancelled']);

const schemaOptions = {
  timestamps: true,
  toJSON: { versionKey: false },
  toObject: { versionKey: false },
};

// Stores an invoice that can be tied back to a resident and optional special collection request.
const billSchema = new Schema({
  userId: { type: Types.ObjectId, ref: 'User', required: true, index: true },
  invoiceNumber: { type: String, required: true, unique: true },
  description: { type: String },
  amount: { type: Number, required: true, min: 0 },
  currency: { type: String, default: 'LKR' },
  billingPeriodStart: { type: Date },
  billingPeriodEnd: { type: Date },
  generatedAt: { type: Date, default: Date.now },
  dueDate: { type: Date, required: true },
  category: {
    type: String,
    enum: BILL_CATEGORIES,
    default: BILL_CATEGORIES[0],
  },
  specialCollectionRequestId: { type: Types.ObjectId, ref: 'SpecialCollectionRequest', index: true },
  status: {
    type: String,
    enum: BILL_STATUSES,
    default: BILL_STATUSES[0],
    index: true,
  },
  paidAt: { type: Date },
  paymentMethod: { type: String },
  stripeSessionId: { type: String, index: true },
  stripePaymentIntentId: { type: String },
}, schemaOptions);

// Optimizes queries that paginate or filter by due date.
billSchema.index({ dueDate: 1 });

module.exports = model('Bill', billSchema);
