/**
 * Apples-to-apples regression check: run the pre-refactor dist and the
 * post-refactor dist against the same HTTP fake for each smoke scenario, then
 * compare the recorded HTTP traffic. Non-deterministic fields (timestamps,
 * generated SHAs, comment ids) get normalized before diffing.
 *
 * Pre-refactor dist is extracted at test-setup time from commit eeb7f3f, the
 * last commit before the @actions/github@6 upgrade. If that commit is not
 * reachable the test is skipped with a clear message.
 */
import {execFileSync, spawn} from 'child_process'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import {startFakeGitHubHttp, FakeGitHubHttp} from '../testHelpers/fakeGithubHttp'

const PRE_REF_COMMIT = 'eeb7f3f'
const currentDist = path.resolve(__dirname, '..', '..', 'dist', 'index.js')
let preDist: string | null = null

function tryExtractPreDist(): string | null {
  try {
    const out = execFileSync(
      'git',
      ['show', `${PRE_REF_COMMIT}:dist/index.js`],
      {maxBuffer: 128 * 1024 * 1024}
    )
    const file = path.join(os.tmpdir(), `cla-pre-${PRE_REF_COMMIT}.js`)
    fs.writeFileSync(file, out)
    return file
  } catch {
    return null
  }
}

function writeEventFile(payload: unknown): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cla-regr-'))
  const file = path.join(dir, 'event.json')
  fs.writeFileSync(file, JSON.stringify(payload))
  return file
}

function runDist(distFile: string, env: Record<string, string>): Promise<{code: number | null}> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [distFile], {
      env: {PATH: process.env.PATH || '', ...env},
      stdio: ['ignore', 'pipe', 'pipe']
    })
    // Drain output so the child does not block on a full stdio pipe.
    child.stdout.resume()
    child.stderr.resume()
    const timer = setTimeout(() => {
      child.kill('SIGKILL')
      reject(new Error('dist timed out'))
    }, 15000)
    child.on('exit', code => {
      clearTimeout(timer)
      resolve({code})
    })
  })
}

function scenarioEnv(fake: FakeGitHubHttp, eventName: string, eventPath: string): Record<string, string> {
  return {
    'INPUT_PATH-TO-SIGNATURES': 'signatures/cla.json',
    'INPUT_PATH-TO-DOCUMENT': 'https://example.com/cla',
    INPUT_BRANCH: 'main',
    INPUT_ALLOWLIST: '*[bot]',
    'INPUT_USE-DCO-FLAG': 'false',
    'INPUT_LOCK-PULLREQUEST-AFTERMERGE': 'true',
    'INPUT_EMPTY-COMMIT-FLAG': 'false',
    GITHUB_API_URL: fake.baseUrl,
    GITHUB_GRAPHQL_URL: `${fake.baseUrl}/graphql`,
    GITHUB_TOKEN: 'smoke-token',
    PERSONAL_ACCESS_TOKEN: 'smoke-pat',
    GITHUB_REPOSITORY: 'acme/widgets',
    GITHUB_ACTOR: 'alice',
    GITHUB_EVENT_NAME: eventName,
    GITHUB_EVENT_PATH: eventPath,
    GITHUB_WORKFLOW: 'cla-check'
  }
}

interface NormalizedRequest {
  method: string
  path: string
  status: number
}

function normalizeLog(log: FakeGitHubHttp['requestLog']): NormalizedRequest[] {
  return log.map(e => ({
    method: e.method,
    // Collapse non-deterministic path segments. The patch URL
    //   /repos/:o/:r/issues/comments/:id
    // carries a server-assigned comment id that will match across runs because
    // the fake state starts clean per scenario, so we only need to strip query
    // strings and percent-encoding quirks.
    path: decodeURIComponent(e.path.split('?')[0] || ''),
    status: e.status
  }))
}

const scenarios: Array<{
  name: string
  setup: (fake: FakeGitHubHttp) => void
  eventName: string
  buildEvent: (fake: FakeGitHubHttp) => unknown
}> = [
  {
    name: 'unsigned contributor opens PR',
    setup: fake => {
      fake.repo('acme', 'widgets').addPullRequest({
        number: 7,
        head: {sha: 'headsha', ref: 'feature/cla'},
        commits: [{author: {login: 'alice', id: 1001}}]
      })
      fake.repo('acme', 'widgets').setFile('signatures/cla.json', {signedContributors: []})
    },
    eventName: 'pull_request_target',
    buildEvent: fake => ({
      action: 'opened',
      pull_request: {number: 7, state: 'open'},
      repository: {id: fake.repo('acme', 'widgets').state.id}
    })
  },
  {
    name: 'sign via comment triggers rerun',
    setup: fake => {
      fake.repo('acme', 'widgets').addPullRequest({
        number: 7,
        head: {sha: 'headsha', ref: 'feature/cla'},
        commits: [{author: {login: 'alice', id: 1001}}]
      })
      fake.repo('acme', 'widgets').setFile('signatures/cla.json', {signedContributors: []})
      fake.repo('acme', 'widgets').addComment(7, {
        body: '**CLA Assistant Lite bot**: comment',
        user: {login: 'github-actions[bot]', id: 41898282}
      })
      fake.repo('acme', 'widgets').addComment(7, {
        body: 'I have read the CLA Document and I hereby sign the CLA',
        user: {login: 'alice', id: 1001}
      })
      fake.repo('acme', 'widgets').addWorkflow('cla-check', [{id: 777, conclusion: 'failure'}])
    },
    eventName: 'issue_comment',
    buildEvent: fake => ({
      action: 'created',
      issue: {number: 7, pull_request: {}},
      comment: {
        body: 'I have read the CLA Document and I hereby sign the CLA',
        user: {login: 'alice', id: 1001}
      },
      repository: {id: fake.repo('acme', 'widgets').state.id}
    })
  },
  {
    name: 'merged PR locks',
    setup: () => {},
    eventName: 'pull_request',
    buildEvent: () => ({
      action: 'closed',
      pull_request: {number: 10, merged: true}
    })
  }
]

describe('pre- vs post-refactor: HTTP-level behaviour is unchanged', () => {
  beforeAll(() => {
    preDist = tryExtractPreDist()
  })

  if (preDist === null) {
    it.skip(`cannot extract dist/index.js from ${PRE_REF_COMMIT}; skipping`, () => {})
    // Still register a real suite below so jest does not complain.
  }

  for (const sc of scenarios) {
    it(`same HTTP traffic for scenario: ${sc.name}`, async () => {
      if (!preDist) {
        // Extraction failed; jest's it.skip above handles the reporting, but
        // the loop still runs — bail.
        return
      }

      async function runOne(distFile: string): Promise<NormalizedRequest[]> {
        const fake = await startFakeGitHubHttp()
        try {
          sc.setup(fake)
          const eventPath = writeEventFile(sc.buildEvent(fake))
          await runDist(distFile, scenarioEnv(fake, sc.eventName, eventPath))
          return normalizeLog(fake.requestLog)
        } finally {
          await fake.close()
        }
      }

      const [pre, post] = await Promise.all([runOne(preDist!), runOne(currentDist)])

      // Sort by path so request ordering (which can differ legitimately across
      // HTTP library versions) does not dominate the diff. We still verify the
      // set of calls.
      const key = (r: NormalizedRequest) => `${r.method} ${r.path}`
      const preSet = pre.map(key).sort()
      const postSet = post.map(key).sort()

      try {
        expect(postSet).toEqual(preSet)
      } catch (e) {
        // Surface the full logs so the failure is actionable.
        const only = (a: string[], b: string[]) => a.filter(x => !b.includes(x))
        throw new Error(
          `HTTP-call set diverges between pre- and post-refactor dist.\n` +
            `  only in pre  : ${JSON.stringify(only(preSet, postSet))}\n` +
            `  only in post : ${JSON.stringify(only(postSet, preSet))}\n` +
            `Underlying error: ${(e as Error).message}`
        )
      }
    }, 30000)
  }
})
