import * as http from 'http'
import { AddressInfo } from 'net'
import {
  createFakeGitHubCore,
  FakeGitHubCore,
  FakeRepoHandle
} from './fakeGithubCore'

/**
 * Real HTTP server variant of the fake. Binds a Node http.Server to
 * 127.0.0.1:<random-port>, routes requests through FakeGitHubCore, and returns
 * the base URL the action should talk to. Used by the Layer 4 smoke test that
 * spawns dist/index.js as a subprocess.
 */
export interface FakeGitHubHttp {
  baseUrl: string
  repo(owner: string, name: string): FakeRepoHandle
  recordedLocks: FakeGitHubCore['recordedLocks']
  recordedRerunRequests: FakeGitHubCore['recordedRerunRequests']
  requestLog: Array<{ method: string; path: string; status: number; body: string }>
  close(): Promise<void>
}

export async function startFakeGitHubHttp(): Promise<FakeGitHubHttp> {
  const core = createFakeGitHubCore()
  const requestLog: FakeGitHubHttp['requestLog'] = []

  const server = http.createServer((req, res) => {
    const chunks: Buffer[] = []
    req.on('data', c => chunks.push(c))
    req.on('end', () => {
      const body = Buffer.concat(chunks).toString('utf-8')
      const { status, body: out, headers } = core.route(
        req.method || 'GET',
        req.url || '/',
        body
      )
      requestLog.push({
        method: req.method || 'GET',
        path: req.url || '/',
        status,
        body
      })
      res.statusCode = status
      res.setHeader('content-type', 'application/json')
      if (headers) {
        for (const [k, v] of Object.entries(headers)) res.setHeader(k, v)
      }
      res.end(out)
    })
  })

  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const addr = server.address() as AddressInfo
  const baseUrl = `http://127.0.0.1:${addr.port}`

  return {
    baseUrl,
    repo: core.repo,
    recordedLocks: core.recordedLocks,
    recordedRerunRequests: core.recordedRerunRequests,
    requestLog,
    close() {
      return new Promise<void>(resolve => server.close(() => resolve()))
    }
  }
}
