module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/__tests__/**/*.test.js'],
  collectCoverage: true,
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov'],
  collectCoverageFrom: [
    'index.js',
    'stickydisk.js',
    '!**/node_modules/**',
    '!**/dist/**'
  ]
}; 