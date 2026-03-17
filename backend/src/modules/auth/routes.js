// Minimal auth routes for residents and admin users.
const router = require('express').Router();
const { login, register } = require('./controller');

router.post('/login', login);
router.post('/register', register);

module.exports = router;
