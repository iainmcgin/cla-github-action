module.exports = {
  clearMocks: true,
  moduleFileExtensions: ['js', 'ts'],
  testEnvironment: 'node',
  testMatch: ['**/*.test.ts'],
  testRunner: 'jest-circus/runner',
  setupFiles: ['<rootDir>/__tests__/testHelpers/setupEnv.ts'],
  transform: {
    '^.+\\.ts$': 'ts-jest'
  },
  verbose: true
}