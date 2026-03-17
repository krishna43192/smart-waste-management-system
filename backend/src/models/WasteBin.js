const { Schema, model } = require('mongoose');

const schemaOptions = {
  timestamps: true,
  toJSON: { versionKey: false },
  toObject: { versionKey: false },
};

// Represents a physical bin and its rough fill-rate characteristics.
const schema = new Schema({
  binId: { type: String, unique: true, index: true },
  ward: { type: String },
  city: { type: String, index: true },
  area: { type: String, index: true },
  location: { lat: Number, lon: Number },
  capacityKg: { type: Number },
  lastPickupAt: { type: Date },
  estRateKgPerDay: { type: Number, default: 3 },
}, schemaOptions);

// Helps locate bins within a city subdivision quickly for operational dashboards.
schema.index({ city: 1, area: 1 });

module.exports = model('WasteBin', schema);
