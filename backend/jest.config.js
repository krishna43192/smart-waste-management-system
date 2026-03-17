module.exports = {
  testEnvironment: 'node',
  coverageDirectory: 'coverage',
  collectCoverageFrom: [
    'src/**/*.js',
    '!src/server.js',
    '!src/app.js',
    '!src/db/**',
    '!src/config/**',
    '!src/services/mailer.js',
    '!**/__tests__/**',
    '!**/node_modules/**',
  ],
  coveragePathIgnorePatterns: [
    '/node_modules/',
    '/__tests__/',
    '/utils.js$',
    'src/services/mailer.js',
  ],
  testMatch: ['**/__tests__/**/*.test.js', '**/?(*.)+(spec|test).js'],
  testPathIgnorePatterns: [
    '/node_modules/',
    '/utils.js$',
  ],
  verbose: true,
  clearMocks: true,
  resetMocks: true,
  restoreMocks: true,
};
