const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const SALT_ROUNDS = 10;

const schemaOptions = {
  timestamps: true,
  toJSON: {
    versionKey: false,
    // Prevents leaking password hashes when documents are serialized.
    transform: (_doc, ret) => {
      delete ret.passwordHash;
      return ret;
    },
  },
  toObject: {
    versionKey: false,
    // Mirrors the JSON transform for consistency across serializers.
    transform: (_doc, ret) => {
      delete ret.passwordHash;
      return ret;
    },
  },
};

// Minimal authentication profile with lockout protection metadata.
const userSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
  },
  name: {
    type: String,
    required: true,
    trim: true,
  },
  passwordHash: {
    type: String,
    required: true,
  },
  role: {
    type: String,
    enum: ['regular', 'admin'],
    default: 'regular',
  },
  isActive: {
    type: Boolean,
    default: true,
  },
  failedLoginAttempts: {
    type: Number,
    default: 0,
  },
  lockUntil: {
    type: Date,
    default: null,
  },
}, schemaOptions);

userSchema.methods.verifyPassword = function verifyPassword(candidate) {
  return bcrypt.compare(candidate, this.passwordHash);
};

userSchema.methods.resetLoginAttempts = async function resetLoginAttempts() {
  if (this.failedLoginAttempts !== 0 || this.lockUntil) {
    this.failedLoginAttempts = 0;
    this.lockUntil = null;
    await this.save();
  }
};

userSchema.methods.registerFailedLogin = async function registerFailedLogin(maxAttempts, lockMinutes) {
  const now = new Date();

  if (this.lockUntil && this.lockUntil > now) {
    return this.lockUntil;
  }

  if (this.lockUntil && this.lockUntil <= now) {
    this.failedLoginAttempts = 0;
    this.lockUntil = null;
  }

  this.failedLoginAttempts += 1;

  if (this.failedLoginAttempts >= maxAttempts) {
    const lockUntil = new Date(now.getTime() + lockMinutes * 60 * 1000);
    this.lockUntil = lockUntil;
    await this.save();
    return lockUntil;
  }

  await this.save();
  return null;
};

userSchema.statics.hashPassword = function hashPassword(plain) {
  return bcrypt.hash(plain, SALT_ROUNDS);
};

module.exports = mongoose.model('User', userSchema);
