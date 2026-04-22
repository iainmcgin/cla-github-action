/**
 * Input and event env helpers. @actions/core reads inputs from
 * `INPUT_<NAME>` (uppercase, spaces -> underscores). @actions/github
 * reads repo/event from GITHUB_* env vars.
 */

const trackedKeys = new Set<string>()

export function setInput(name: string, value: string): void {
  const key = `INPUT_${name.replace(/ /g, '_').toUpperCase()}`
  process.env[key] = value
  trackedKeys.add(key)
}

export function resetEnv(): void {
  for (const key of trackedKeys) {
    delete process.env[key]
  }
  trackedKeys.clear()
}

/** Set the full set of inputs the action typically receives. */
export function setDefaultInputs(
  overrides: Partial<Record<string, string>> = {}
): void {
  const defaults: Record<string, string> = {
    'path-to-signatures': 'signatures/v1/cla.json',
    'path-to-document': 'https://example.com/cla',
    branch: 'main',
    allowlist: 'dependabot[bot],*[bot]',
    'remote-organization-name': '',
    'remote-repository-name': '',
    'create-file-commit-message': 'Creating file for storing CLA Signatures',
    'signed-commit-message': '$contributorName has signed the CLA',
    'use-dco-flag': 'false',
    'lock-pullrequest-aftermerge': 'true'
  }
  for (const [k, v] of Object.entries({ ...defaults, ...overrides })) {
    if (v !== undefined) setInput(k, v)
  }
}
