import { getOctokit } from '@actions/github'
import * as core from '@actions/core'

/** The Octokit instance type returned by @actions/github's getOctokit. */
export type Octokit = ReturnType<typeof getOctokit>

let defaultClient: Octokit | undefined
let patClient: Octokit | undefined

function readEnvToken(name: string): string {
  const v = process.env[name]
  if (!v) throw new Error(`${name} environment variable is required`)
  return v
}

export function getDefaultOctokitClient(): Octokit {
  if (!defaultClient) {
    defaultClient = getOctokit(readEnvToken('GITHUB_TOKEN'))
  }
  return defaultClient
}

export function getPATOctokit(): Octokit {
  if (!patClient) {
    const token = process.env.PERSONAL_ACCESS_TOKEN
    if (!token) {
      core.setFailed(
        `Please add a personal access token as an environment variable for writing signatures in a remote repository/organization as mentioned in the README.md file`
      )
      throw new Error('PERSONAL_ACCESS_TOKEN is required for remote signatures repo')
    }
    patClient = getOctokit(token)
  }
  return patClient
}

/**
 * The default client used for all non-remote-repo operations. Lazily
 * constructed on first property access so importing this module has no
 * side effects.
 */
export const octokit: Octokit = new Proxy({} as Octokit, {
  get(_target, prop: string | symbol) {
    const client = getDefaultOctokitClient() as unknown as Record<string | symbol, unknown>
    const value = client[prop]
    return typeof value === 'function' ? (value as Function).bind(client) : value
  }
})

export function isPersonalAccessTokenPresent(): boolean {
  return Boolean(process.env.PERSONAL_ACCESS_TOKEN)
}

/** For tests: reset cached clients so a subsequent call picks up new env. */
export function _resetOctokitClientsForTests(): void {
  defaultClient = undefined
  patClient = undefined
}
