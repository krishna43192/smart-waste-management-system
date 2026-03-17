const { Schema, model } = require('mongoose');

const CUSTOMER_TYPES = Object.freeze(['household', 'business']);
const WASTE_TYPES = Object.freeze(['household', 'business', 'organic', 'recyclable', 'non-recyclable', 'industrial']);
const BILLING_MODELS = Object.freeze(['weight-based', 'flat-fee', 'subscription']);

const schemaOptions = {
  timestamps: true,
  toJSON: { versionKey: false },
  toObject: { versionKey: false },
};

// Aggregation-friendly snapshot of each pickup for analytics.
const recordSchema = new Schema({
  collectionDate: { 
    type: Date, 
    required: [true, 'Collection date is required'], 
    index: true,
    validate: {
      validator: (value) => value <= new Date(),
      message: 'Collection date cannot be in the future',
    },
  },
  region: { 
    type: String, 
    required: [true, 'Region is required'], 
    index: true,
    trim: true,
    minlength: [1, 'Region cannot be empty'],
  },
  zone: { 
    type: String,
    trim: true,
  },
  householdId: { 
    type: String, 
    required: [true, 'Household ID is required'],
    trim: true,
    index: true,
  },
  customerType: {
    type: String,
    enum: CUSTOMER_TYPES,
    default: CUSTOMER_TYPES[0],
  },
  wasteType: {
    type: String,
    enum: WASTE_TYPES,
    required: true,
  },
  billingModel: {
    type: String,
    enum: BILLING_MODELS,
    required: true,
  },
  weightKg: { type: Number, required: true, min: 0 },
  recyclableKg: { type: Number, default: 0, min: 0 },
  nonRecyclableKg: { type: Number, default: 0, min: 0 },
  recyclableRatio: { type: Number, default: 0, min: 0 },
}, schemaOptions);

// Enables dashboards to slice records by geography, billing model, and waste type efficiently.
recordSchema.index({ region: 1, collectionDate: -1 });
recordSchema.index({ billingModel: 1, collectionDate: -1 });
recordSchema.index({ wasteType: 1, collectionDate: -1 });
recordSchema.index({ householdId: 1, collectionDate: -1 });

/**
 * Pre-save hook to calculate recyclable ratio automatically
 * Follows DRY principle by centralizing this calculation logic
 */
recordSchema.pre('save', function calculateRecyclableRatio(next) {
  if (this.weightKg > 0) {
    this.recyclableRatio = Number((this.recyclableKg / this.weightKg).toFixed(4));
  } else {
    this.recyclableRatio = 0;
  }
  next();
});

/**
 * Virtual property to check if the collection is primarily recyclable
 * @returns {Boolean} True if more than 50% of waste is recyclable
 */
recordSchema.virtual('isPrimarilyRecyclable').get(function() {
  return this.recyclableRatio > 0.5;
});

/**
 * Static method to get date range boundaries
 * Encapsulates query logic following Information Expert pattern
 * 
 * @returns {Promise<Object>} Object containing earliest and latest collection dates
 */
recordSchema.statics.getDateRange = async function() {
  const [earliest, latest] = await Promise.all([
    this.findOne().sort({ collectionDate: 1 }).select('collectionDate').lean(),
    this.findOne().sort({ collectionDate: -1 }).select('collectionDate').lean(),
  ]);
  
  return {
    from: earliest?.collectionDate ?? null,
    to: latest?.collectionDate ?? null,
  };
};

/**
 * Static method to get all distinct filter values
 * Provides a clean interface for retrieving configuration data
 * 
 * @returns {Promise<Object>} Object containing arrays of unique regions, waste types, and billing models
 */
recordSchema.statics.getDistinctFilters = async function() {
  const [regions, wasteTypes, billingModels] = await Promise.all([
    this.distinct('region'),
    this.distinct('wasteType'),
    this.distinct('billingModel'),
  ]);
  
  return { regions, wasteTypes, billingModels };
};

// Export the model and constants for use in other modules
module.exports = model('WasteCollectionRecord', recordSchema);
module.exports.CUSTOMER_TYPES = CUSTOMER_TYPES;
module.exports.WASTE_TYPES = WASTE_TYPES;
module.exports.BILLING_MODELS = BILLING_MODELS;
