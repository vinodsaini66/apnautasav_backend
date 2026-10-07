/**
 * Backend tests live in tests/ (outside src/, so `tsc` builds never ship them).
 * Each test file gets its own in-memory MongoDB via tests/helpers/db.ts.
 */
module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  testMatch: ['**/*.test.ts'],
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.test.json' }],
  },
  setupFiles: ['<rootDir>/tests/helpers/env.ts'],
  testTimeout: 60000,
};
