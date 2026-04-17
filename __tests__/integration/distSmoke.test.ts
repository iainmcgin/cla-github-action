import { spawn } from 'child_process'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import {
  startFakeGitHubHttp,
  FakeGitHubHttp
} from '../testHelpers/fakeGithubHttp'

const distPath = path.resolve(__dirname, '..', '..', 'dist', 'index.js')

function writeEventFile(payload: unknown): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cla-smoke-'))
  const file = path.join(dir, 'event.json')
  fs.writeFileSync(file, JSON.stringify(payload))
  return file
}

interface SpawnResult {
  code: number | null
  stdout: string
  stderr: string
}

function runDist(
  env: Record<string, string>,
  timeoutMs = 15000
): Promise<SpawnResult> {
  return new Promise((resolve, reject) => {
    // Start from a clean env so `NODE_ENV=test` from jest does NOT leak in and
    // disable the action's auto-run block at the bottom of src/main.ts.
    const child = spawn(process.execPath, [distPath], {
      env: { PATH: process.env.PATH || '', ...env },
      stdio: ['ignore', 'pipe', 'pipe']
    })
    const out: Buffer[] = []
    const err: Buffer[] = []
    child.stdout.on('data', c => out.push(c))
    child.stderr.on('data', c => err.push(c))

    const timer = setTimeout(() => {
      child.kill('SIGKILL')
      reject(new Error(`dist/index.js timed out after ${timeoutMs}ms`))
    }, timeoutMs)

    child.on('exit', code => {
      clearTimeout(timer)
      resolve({
        code,
        stdout: Buffer.concat(out).toString('utf-8'),
        stderr: Buffer.concat(err).toString('utf-8')
      })
    })
  })
}

function defaultInputEnv(
  overrides: Record<string, string> = {}
): Record<string, string> {
  const base: Record<string, string> = {
    'INPUT_PATH-TO-SIGNATURES': 'signatures/cla.json',
    'INPUT_PATH-TO-DOCUMENT': 'https://example.com/cla',
    INPUT_BRANCH: 'main',
    INPUT_ALLOWLIST: '*[bot]',
    'INPUT_USE-DCO-FLAG': 'false',
    'INPUT_LOCK-PULLREQUEST-AFTERMERGE': 'true'
  }
  return { ...base, ...overrides }
}

function githubEnv(
  fake: FakeGitHubHttp,
  params: {
    eventName: string
    eventPath: string
    repo?: string
    actor?: string
    workflow?: string
  }
): Record<string, string> {
  return {
    GITHUB_API_URL: fake.baseUrl,
    GITHUB_GRAPHQL_URL: `${fake.baseUrl}/graphql`,
    GITHUB_TOKEN: 'smoke-token',
    PERSONAL_ACCESS_TOKEN: 'smoke-pat',
    GITHUB_REPOSITORY: params.repo || 'acme/widgets',
    GITHUB_ACTOR: params.actor || 'alice',
    GITHUB_EVENT_NAME: params.eventName,
    GITHUB_EVENT_PATH: params.eventPath,
    GITHUB_WORKFLOW: params.workflow || 'cla-check'
  }
}

describe('Layer 4 smoke test: dist/index.js against HTTP fake', () => {
  let fake: FakeGitHubHttp

  beforeEach(async () => {
    fake = await startFakeGitHubHttp()
  })
  afterEach(async () => {
    await fake.close()
  })

  it('bundled action posts a notice comment and reports failure for an unsigned contributor', async () => {
    fake.repo('acme', 'widgets').addPullRequest({
      number: 7,
      head: { sha: 'headsha', ref: 'feature/cla' },
      commits: [{ author: { login: 'alice', id: 1001 } }]
    })
    fake
      .repo('acme', 'widgets')
      .setFile('signatures/cla.json', { signedContributors: [] })

    const eventPath = writeEventFile({
      action: 'opened',
      pull_request: { number: 7, state: 'open' },
      repository: { id: fake.repo('acme', 'widgets').state.id }
    })

    const result = await runDist({
      ...defaultInputEnv(),
      ...githubEnv(fake, { eventName: 'pull_request_target', eventPath })
    })

    // The GitHub Actions toolkit emits `::error::...` on stdout for setFailed,
    // which also sets the process exit code to 1.
    expect(result.stdout).toMatch(
      /::error::.*Committers of Pull Request number 7/
    )
    expect(result.code).toBe(1)

    const comments = fake.repo('acme', 'widgets').listComments(7)
    expect(comments).toHaveLength(1)
    expect(comments[0]!.body).toMatch(/CLA Assistant Lite bot/)
  }, 20000)

  it('bundled action writes a new signature and requests a workflow rerun when a contributor signs via comment', async () => {
    fake.repo('acme', 'widgets').addPullRequest({
      number: 7,
      head: { sha: 'headsha', ref: 'feature/cla' },
      commits: [{ author: { login: 'alice', id: 1001 } }]
    })
    fake
      .repo('acme', 'widgets')
      .setFile('signatures/cla.json', { signedContributors: [] })
    fake.repo('acme', 'widgets').addComment(7, {
      body: 'something **CLA Assistant Lite bot** says',
      user: { login: 'github-actions[bot]', id: 41898282 }
    })
    fake.repo('acme', 'widgets').addComment(7, {
      body: 'I have read the CLA Document and I hereby sign the CLA',
      user: { login: 'alice', id: 1001 }
    })
    fake
      .repo('acme', 'widgets')
      .addWorkflow('cla-check', [{ id: 777, conclusion: 'failure' }])

    const eventPath = writeEventFile({
      action: 'created',
      issue: { number: 7, pull_request: {} },
      comment: {
        body: 'I have read the CLA Document and I hereby sign the CLA',
        user: { login: 'alice', id: 1001 }
      },
      repository: { id: fake.repo('acme', 'widgets').state.id }
    })

    const result = await runDist({
      ...defaultInputEnv(),
      ...githubEnv(fake, { eventName: 'issue_comment', eventPath })
    })

    expect(result.code).toBe(0)

    const sigFile = fake
      .repo('acme', 'widgets')
      .getFile('signatures/cla.json') as any
    expect(sigFile.signedContributors.map((c: any) => c.name)).toContain(
      'alice'
    )

    expect(fake.recordedRerunRequests).toEqual([
      { owner: 'acme', repo: 'widgets', runId: 777 }
    ])
  }, 20000)

  it('bundled action calls the lock endpoint on a merged PR close event', async () => {
    const eventPath = writeEventFile({
      action: 'closed',
      pull_request: { number: 10, merged: true }
    })

    const result = await runDist({
      ...defaultInputEnv(),
      ...githubEnv(fake, { eventName: 'pull_request', eventPath })
    })

    expect(result.code).toBe(0)
    expect(fake.recordedLocks).toEqual([
      { owner: 'acme', repo: 'widgets', issue: 10 }
    ])
  }, 20000)
})
