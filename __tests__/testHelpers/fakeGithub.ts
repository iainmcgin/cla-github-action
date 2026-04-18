import { MockAgent, setGlobalDispatcher, getGlobalDispatcher } from 'undici'
import {
  createFakeGitHubCore,
  FakeGitHubCore,
  FakeRepoHandle
} from './fakeGithubCore'

/**
 * In-process fake: routes all undici fetch requests through FakeGitHubCore via
 * an undici MockAgent. Used by Layer 2 + Layer 3 tests that import src/ modules
 * directly.
 */
export interface FakeGitHub {
  repo(owner: string, name: string): FakeRepoHandle
  recordedLocks: FakeGitHubCore['recordedLocks']
  recordedRerunRequests: FakeGitHubCore['recordedRerunRequests']
  close(): Promise<void>
}

export function installFakeGitHub(): FakeGitHub {
  const original = getGlobalDispatcher()
  const agent = new MockAgent()
  agent.disableNetConnect()
  setGlobalDispatcher(agent)

  const core = createFakeGitHubCore()
  const pool = agent.get('https://api.github.com')

  function makeReply(method: string) {
    return (opts: any) => {
      const rawBody = typeof opts.body === 'string' ? opts.body : ''
      const { status, body, headers } = core.route(method, opts.path, rawBody)
      return {
        statusCode: status,
        data: body,
        responseOptions: {
          headers: { 'content-type': 'application/json', ...(headers || {}) }
        }
      }
    }
  }

  for (const method of ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const) {
    pool.intercept({ path: /.*/, method }).reply(makeReply(method)).persist()
  }

  return {
    repo: core.repo,
    recordedLocks: core.recordedLocks,
    recordedRerunRequests: core.recordedRerunRequests,
    async close() {
      await agent.close()
      setGlobalDispatcher(original)
    }
  }
}
