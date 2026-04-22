/**
 * Failure-mode scenarios: how does the action behave when GitHub returns a
 * transient 5xx, a 403, or when createFile fails?
 *
 * @octokit/request retries some 5xx transparently, so a single injected
 * failure can be absorbed. These tests therefore inject PERMANENT failures
 * (high times:N) to lock in the behaviour when retries eventually give up.
 */
import * as core from '@actions/core'
import { installFakeGitHub, FakeGitHub } from '../testHelpers/fakeGithub'
import { resetEnv, setDefaultInputs } from '../testHelpers/env'
import { reloadOctokit, setContext } from '../testHelpers/context'

async function runAction() {
  reloadOctokit()
  for (const path of Object.keys(require.cache)) {
    if (path.includes('/src/')) delete require.cache[path]
  }
  const { run } = require('../../src/main') as typeof import('../../src/main')
  await run()
}

function watchCore() {
  const failed = jest.spyOn(core, 'setFailed').mockImplementation(() => {})
  const warned = jest.spyOn(core, 'warning').mockImplementation(() => {})
  return {
    get failures() {
      return failed.mock.calls.map(c => String(c[0]))
    },
    get warnings() {
      return warned.mock.calls.map(c => String(c[0]))
    },
    restore() {
      failed.mockRestore()
      warned.mockRestore()
    }
  }
}

describe('error paths', () => {
  let fake: FakeGitHub

  beforeEach(() => {
    setDefaultInputs()
    fake = installFakeGitHub()
  })
  afterEach(async () => {
    await fake.close()
    resetEnv()
  })

  it('reports the failure cleanly when the contents GET returns a transient 502', async () => {
    const watch = watchCore()
    fake.repo('acme', 'widgets').addPullRequest({
      number: 7,
      head: { sha: 'headsha', ref: 'feature/cla' },
      commits: [{ author: { login: 'alice', id: 1001 } }]
    })
    fake.repo('acme', 'widgets').setFile('signatures/v1/cla.json', {
      signedContributors: []
    })
    // Inject enough 502s that any transparent retry will exhaust them all.
    fake.injectFailure({
      method: 'GET',
      pathPattern: /\/repos\/acme\/widgets\/contents\/signatures/,
      status: 502,
      times: 1000
    })

    setContext({
      owner: 'acme',
      repo: 'widgets',
      issueNumber: 7,
      actor: 'alice',
      eventName: 'pull_request_target',
      payload: {
        pull_request: { number: 7, state: 'open' },
        repository: { id: fake.repo('acme', 'widgets').state.id },
        action: 'opened'
      }
    })

    await runAction()

    // The action reports the failure through core.setFailed. It does not
    // silently retry (v6 @actions/github does not ship plugin-retry).
    expect(watch.failures.join('\n')).toMatch(
      /Could not retrieve repository contents|Could not update the JSON file/
    )
    watch.restore()
  })

  it('reports the failure cleanly when createOrUpdateFileContents returns 422 on bootstrap', async () => {
    const watch = watchCore()
    fake.repo('acme', 'widgets').addPullRequest({
      number: 7,
      head: { sha: 'headsha', ref: 'feature/cla' },
      commits: [{ author: { login: 'alice', id: 1001 } }]
    })
    // Force the bootstrap path (no existing signatures file).
    fake.injectFailure({
      method: 'PUT',
      pathPattern: /\/repos\/acme\/widgets\/contents\/signatures/,
      status: 422,
      body: JSON.stringify({ message: 'branch is protected' }),
      times: 1000
    })

    setContext({
      owner: 'acme',
      repo: 'widgets',
      issueNumber: 7,
      actor: 'alice',
      eventName: 'pull_request_target',
      payload: {
        pull_request: { number: 7, state: 'open' },
        repository: { id: fake.repo('acme', 'widgets').state.id },
        action: 'opened'
      }
    })

    await runAction()

    // setupClaCheck's catch wraps this specifically — the user-facing message
    // tells them the signatures-file branch must not be protected.
    expect(watch.failures.join('\n')).toMatch(
      /creating the signed contributors file.*branch.*protected/i
    )
    watch.restore()
  })

  it('swallows a rerun-workflow failure as a warning rather than failing the whole action', async () => {
    const watch = watchCore()
    fake.repo('acme', 'widgets').addPullRequest({
      number: 7,
      head: { sha: 'headsha', ref: 'feature/cla' },
      commits: [{ author: { login: 'alice', id: 1001 } }]
    })
    fake.repo('acme', 'widgets').setFile('signatures/v1/cla.json', {
      signedContributors: []
    })
    fake.repo('acme', 'widgets').addComment(7, {
      body: '**CLA Assistant Lite bot**: notice',
      user: { login: 'github-actions[bot]', id: 41898282 }
    })
    fake.repo('acme', 'widgets').addComment(7, {
      body: 'i have read the cla document and i hereby sign the cla',
      user: { login: 'alice', id: 1001 }
    })
    fake
      .repo('acme', 'widgets')
      .addWorkflow('cla-check', [{ id: 777, conclusion: 'failure' }])

    // Rerun-workflow-run fails at the 'listWorkflowRuns' step.
    fake.injectFailure({
      method: 'GET',
      pathPattern: /\/repos\/acme\/widgets\/actions\/workflows\/\d+\/runs/,
      status: 503,
      times: 1000
    })

    setContext({
      owner: 'acme',
      repo: 'widgets',
      issueNumber: 7,
      actor: 'alice',
      eventName: 'issue_comment',
      payload: {
        action: 'created',
        issue: { number: 7, pull_request: {} },
        comment: {
          body: 'I have read the CLA Document and I hereby sign the CLA',
          user: { login: 'alice', id: 1001 }
        },
        repository: { id: fake.repo('acme', 'widgets').state.id }
      }
    })

    await runAction()

    // The signature should still have been recorded even though the rerun
    // request failed.
    const sigFile = fake
      .repo('acme', 'widgets')
      .getFile('signatures/v1/cla.json') as {
      signedContributors: Array<{ name: string }>
    }
    expect(sigFile.signedContributors.map(c => c.name)).toContain('alice')

    // The rerun failure should be logged as a warning, not a hard failure.
    expect(watch.warnings.join('\n')).toMatch(/rerun of prior workflow failed/i)
    expect(watch.failures).toEqual([])
    watch.restore()
  })
})
