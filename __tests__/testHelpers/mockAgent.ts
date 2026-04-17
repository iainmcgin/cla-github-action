import {MockAgent, setGlobalDispatcher, getGlobalDispatcher, Dispatcher} from 'undici'

/**
 * Per-test helper: installs an isolated undici MockAgent as the global HTTP
 * dispatcher, disables outbound network connections, and restores the original
 * dispatcher on teardown.
 */
export interface MockAgentHarness {
  agent: MockAgent
  github: () => ReturnType<MockAgent['get']>
  assertClean: () => void
  close: () => Promise<void>
}

export function installMockAgent(): MockAgentHarness {
  const original: Dispatcher = getGlobalDispatcher()
  const agent = new MockAgent()
  agent.disableNetConnect()
  setGlobalDispatcher(agent)

  return {
    agent,
    github: () => agent.get('https://api.github.com'),
    assertClean: () => agent.assertNoPendingInterceptors(),
    close: async () => {
      await agent.close()
      setGlobalDispatcher(original)
    }
  }
}

/** Jest-style beforeEach/afterEach setup. Returns a getter. */
export function useMockAgent(): () => MockAgentHarness {
  let harness: MockAgentHarness | undefined
  beforeEach(() => {
    harness = installMockAgent()
  })
  afterEach(async () => {
    await harness!.close()
    harness = undefined
  })
  return () => harness!
}

/**
 * Install an interceptor that captures the request body as JSON and returns
 * the given reply. The returned object's `body` is populated after the request
 * is made.
 */
export function captureJson<T = any>(
  pool: ReturnType<MockAgent['get']>,
  match: {path: string | RegExp; method: string},
  reply: {status: number; body: any}
): {body: T | undefined; rawBody: string | undefined} {
  const captured: {body: T | undefined; rawBody: string | undefined} = {
    body: undefined,
    rawBody: undefined
  }
  pool
    .intercept(match)
    .reply(
      reply.status,
      (opts: any) => {
        const raw = typeof opts.body === 'string' ? opts.body : ''
        captured.rawBody = raw
        try {
          captured.body = raw ? (JSON.parse(raw) as T) : undefined
        } catch {
          captured.body = undefined
        }
        return reply.body
      },
      {headers: {'content-type': 'application/json'}}
    )
  return captured
}
