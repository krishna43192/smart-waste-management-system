const User = require('../../models/User');

const MAX_FAILED_ATTEMPTS = 3;
const LOCK_DURATION_MINUTES = 15;

// Codes are consumed by the controller to pick appropriate HTTP statuses.
const ERROR_CODES = Object.freeze({
  inactive: 'ACCOUNT_INACTIVE',
  locked: 'ACCOUNT_LOCKED',
  emailTaken: 'EMAIL_TAKEN',
});

// Removes sensitive fields before returning the user to the caller.
const toViewModel = userDoc => ({
  id: userDoc.id,
  email: userDoc.email,
  name: userDoc.name,
  role: userDoc.role,
});

const normalizeEmail = value => value.trim().toLowerCase();

const createError = (code, message, extra = {}) => Object.assign(new Error(message), { code, ...extra });

// Attempts authentication while enforcing lockout rules and returns a safe profile.
async function authenticate(email, password) {
  const normalizedEmail = normalizeEmail(email);
  const user = await User.findOne({ email: normalizedEmail });
  if (!user) return null;

  const now = new Date();
  if (user.lockUntil && user.lockUntil > now) {
    throw createError(ERROR_CODES.locked, 'Too many failed attempts. Please try again later.', {
      lockUntil: user.lockUntil,
    });
  }

  if (user.lockUntil && user.lockUntil <= now) {
    user.failedLoginAttempts = 0;
    user.lockUntil = null;
    await user.save();
  }

  if (!user.isActive) {
    throw createError(ERROR_CODES.inactive, 'This account is not active. Please contact support.');
  }

  const passwordOk = await user.verifyPassword(password);
  if (!passwordOk) {
    const lockedUntil = await user.registerFailedLogin(MAX_FAILED_ATTEMPTS, LOCK_DURATION_MINUTES);
    if (lockedUntil) {
      throw createError(ERROR_CODES.locked, 'Account locked due to repeated failed attempts.', {
        lockUntil: lockedUntil,
      });
    }
    return null;
  }

  await user.resetLoginAttempts();

  return toViewModel(user);
}

// Creates a new resident record with a hashed password and canonical email.
async function createUser({ name, email, password }) {
  const normalizedEmail = normalizeEmail(email);
  const existing = await User.findOne({ email: normalizedEmail });
  if (existing) {
    throw createError(ERROR_CODES.emailTaken, 'An account already exists for this email');
  }

  const passwordHash = await User.hashPassword(password);
  const user = await User.create({
    name: name.trim(),
    email: normalizedEmail,
    passwordHash,
    role: 'regular',
  });

  return toViewModel(user);
}

// Utility hook for other modules that need to fetch a user by email.
async function findUserByEmail(email) {
  return User.findOne({ email: normalizeEmail(email) });
}

module.exports = {
  authenticate,
  createUser,
  findUserByEmail,
  ERROR_CODES,
};
