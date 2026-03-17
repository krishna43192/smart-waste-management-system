const { Schema, model } = require('mongoose');

const schemaOptions = {
  timestamps: true,
  toJSON: { versionKey: false },
  toObject: { versionKey: false },
};

// Stores individual collection events emitted by on-truck devices.
const schema = new Schema({
  binId: { type: String, index: true },
  truckId: { type: String, index: true },
  ts: { type: Date, default: Date.now },
  notes: { type: String },
}, schemaOptions);

// Speeds up lookups when aggregating collections per bin.
schema.index({ binId: 1, ts: -1 });

module.exports = model('CollectionEvent', schema);
