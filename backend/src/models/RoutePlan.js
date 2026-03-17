const { Schema, model } = require('mongoose');

const schemaOptions = {
  timestamps: true,
  toJSON: { versionKey: false },
  toObject: { versionKey: false },
};

// Embedded structure captures route stops without extra collections.
const stopSchema = new Schema({
  binId: { type: String },
  lat: { type: Number },
  lon: { type: Number },
  estKg: { type: Number },
  visited: { type: Boolean, default: false },
}, { _id: false });

// Tracks a single day's optimized plan for a collection truck.
const schema = new Schema({
  date: { type: Date, index: true },
  ward: { type: String },
  city: { type: String, index: true },
  area: { type: String, index: true },
  truckId: { type: String, index: true },
  depot: { lat: Number, lon: Number },
  stops: { type: [stopSchema], default: [] },
  loadKg: { type: Number },
  distanceKm: { type: Number },
}, schemaOptions);

// Supports daily lookups for a specific truck operating within a city.
schema.index({ city: 1, truckId: 1, date: 1 });

module.exports = model('RoutePlan', schema);
