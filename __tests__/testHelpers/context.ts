import * as github from '@actions/github'

export interface TestContext {
  owner: string
  repo: string
  issueNumber: number
  actor: string
  eventName: string
  workflow: string
  payload: any
}

const defaults: TestContext = {
  owner: 'acme',
  repo: 'widgets',
  issueNumber: 42,
  actor: 'alice',
  eventName: 'pull_request_target',
  workflow: 'cla-check',
  payload: {}
}

/** Overwrite the @actions/github context with test values. */
export function setContext(overrides: Partial<TestContext> = {}): TestContext {
  const ctx = { ...defaults, ...overrides }
  // @ts-ignore — overwrite the readonly Context instance for test setup
  github.context = {
    repo: { owner: ctx.owner, repo: ctx.repo },
    issue: { owner: ctx.owner, repo: ctx.repo, number: ctx.issueNumber },
    actor: ctx.actor,
    eventName: ctx.eventName,
    workflow: ctx.workflow,
    payload: ctx.payload
  }
  return ctx
}

/** Drop the module cache for src/octokit.ts so a test-owned GITHUB_TOKEN is picked up. */
export function reloadOctokit(): void {
  const p = require.resolve('../../src/octokit')
  delete require.cache[p]
}
