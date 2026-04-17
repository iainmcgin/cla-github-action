/**
 * Runs before each test file loads any module.
 * Populates the env vars that src/ modules read at import time.
 */
process.env.GITHUB_TOKEN = process.env.GITHUB_TOKEN || 'test-token'
process.env.PERSONAL_ACCESS_TOKEN =
  process.env.PERSONAL_ACCESS_TOKEN || 'test-pat'
