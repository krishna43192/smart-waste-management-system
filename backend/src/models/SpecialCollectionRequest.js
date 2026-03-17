const { Schema, model, Types } = require('mongoose');

const REQUEST_STATUSES = Object.freeze(['scheduled', 'cancelled', 'pending-payment', 'payment-failed']);
const PAYMENT_STATUSES = Object.freeze(['pending', 'success', 'failed', 'not-required']);

const schemaOptions = {
  timestamps: true,
  toJSON: { versionKey: false },
  toObject: { versionKey: false },
};

// Embedded representation of the chosen booking slot.
const slotSchema = new Schema({
  slotId: { type: String, required: true },
  start: { type: Date, required: true },
  end: { type: Date, required: true },
}, { _id: false });

// Core document for the special collection booking workflow.
const requestSchema = new Schema({
  userId: { type: Types.ObjectId, ref: 'User', required: true },
  userEmail: { type: String, required: true },
  userName: { type: String, required: true },
  residentName: { type: String, required: true },
  ownerName: { type: String },
  address: { type: String, required: true },
  district: { type: String, required: true },
  contactEmail: { type: String, required: true },
  contactPhone: { type: String, required: true },
  approxWeightKg: { type: Number },
  totalWeightKg: { type: Number },
  specialNotes: { type: String },
  itemType: { type: String, required: true },
  itemLabel: { type: String },
  quantity: { type: Number, required: true, min: 1 },
  preferredDateTime: { type: Date, required: true },
  slot: { type: slotSchema, required: true },
  status: {
    type: String,
    enum: REQUEST_STATUSES,
    default: REQUEST_STATUSES[0],
  },
  paymentRequired: { type: Boolean, default: false },
  paymentStatus: {
    type: String,
    enum: PAYMENT_STATUSES,
    default: PAYMENT_STATUSES[3],
  },
  paymentAmount: { type: Number, default: 0 },
  paymentSubtotal: { type: Number, default: 0 },
  paymentWeightCharge: { type: Number, default: 0 },
  paymentTaxCharge: { type: Number, default: 0 },
  paymentReference: { type: String },
  paymentDueAt: { type: Date },
  billingId: { type: Types.ObjectId, ref: 'Bill' },
  notifications: {
    residentSentAt: { type: Date },
    authoritySentAt: { type: Date },
  },
  cancellationReason: { type: String },
}, schemaOptions);

// Supports identifying slot capacity breaches while keeping query predicates simple.
requestSchema.index({ 'slot.slotId': 1 });
requestSchema.index({ userId: 1, createdAt: -1 });

module.exports = model('SpecialCollectionRequest', requestSchema);
