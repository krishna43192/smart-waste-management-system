const { z } = require('zod');
const authService = require('./service');

const { ERROR_CODES } = authService;

// Normalised JSON error shape keeps the frontend handler simple.
const respondWithError = (res, status, message, extra = {}) => (
  res.status(status).json({ ok: false, message, ...extra })
);

// Credentials rules mirror the registration form expectations.
const loginSchema = z.object({
  email: z.string({ required_error: 'Email is required' }).email('Enter a valid email'),
  password: z.string({ required_error: 'Password is required' }).min(6, 'Password must be at least 6 characters'),
});

// Registration requires a stronger password than login for future-proofing.
const registerSchema = z.object({
  name: z.string({ required_error: 'Name is required' }).min(2, 'Name must be at least 2 characters').max(80, 'Name is too long'),
  email: z.string({ required_error: 'Email is required' }).email('Enter a valid email'),
  password: z.string({ required_error: 'Password is required' }).min(8, 'Password must be at least 8 characters'),
});

// Authenticates a resident or admin and returns a trimmed user profile.
async function login(req, res, next) {
  try {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      return respondWithError(res, 400, parsed.error.errors[0].message);
    }

    const { email, password } = parsed.data;
    const user = await authService.authenticate(email, password);

    if (!user) {
      return respondWithError(res, 401, 'Invalid email or password');
    }

    return res.json({
      ok: true,
      message: `Welcome back, ${user.name}`,
      user,
    });
  } catch (error) {
    if (error.code === ERROR_CODES.inactive) {
      return respondWithError(res, 403, error.message);
    }
    if (error.code === ERROR_CODES.locked) {
      return respondWithError(res, 423, error.message, { lockUntil: error.lockUntil });
    }
    return next(error);
  }
}

// Creates a user account and immediately signs the caller in.
async function register(req, res, next) {
  try {
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) {
      return respondWithError(res, 400, parsed.error.errors[0].message);
    }

    const payload = parsed.data;
    const user = await authService.createUser(payload);

    return res.status(201).json({
      ok: true,
      message: 'Account created. You are now signed in.',
      user,
    });
  } catch (error) {
    if (error.code === ERROR_CODES.emailTaken) {
      return respondWithError(res, 409, error.message);
    }
    return next(error);
  }
}

module.exports = {
  login,
  register,
};
