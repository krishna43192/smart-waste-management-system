const { Schema, model } = require('mongoose');

const schemaOptions = {
  timestamps: true,
  toJSON: { versionKey: false },
  toObject: { versionKey: false },
};

// Bounding box persists polygon outlines from the GIS metadata.
const bboxSchema = {
  type: [[Number]],
  default: undefined,
};

// Captures high-level operational metrics for a municipality.
const schema = new Schema({
  name: { type: String, unique: true, index: true },
  code: { type: String, unique: true },
  depot: { lat: Number, lon: Number },
  bbox: bboxSchema,
  areaSqKm: Number,
  population: Number,
  lastCollectionAt: Date,
}, schemaOptions);

module.exports = model('City', schema);
