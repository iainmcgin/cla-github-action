import {captureJson, installMockAgent, MockAgentHarness} from '../testHelpers/mockAgent'
import {resetEnv} from '../testHelpers/env'
import {reloadOctokit, setContext} from '../testHelpers/context'

const modulePath = require.resolve('../../src/pullrequest/pullRequestLock')
function loadModule() {
  reloadOctokit()
  delete require.cache[modulePath]
  return require('../../src/pullrequest/pullRequestLock') as typeof import('../../src/pullrequest/pullRequestLock')
}

describe('lockPullRequest', () => {
  let http: MockAgentHarness
  beforeEach(() => {
    http = installMockAgent()
    setContext({issueNumber: 123})
  })
  afterEach(async () => {
    await http.close()
    resetEnv()
  })

  it('PUTs /repos/:o/:r/issues/:n/lock for the current PR', async () => {
    const captured = captureJson(
      http.github(),
      {path: '/repos/acme/widgets/issues/123/lock', method: 'PUT'},
      {status: 204, body: ''}
    )

    const {lockPullRequest} = loadModule()
    await lockPullRequest()
    http.assertClean()
    // body is typically undefined/empty for the lock endpoint
    expect(captured.rawBody === undefined || captured.rawBody === '').toBe(true)
  })

  it('does not throw when the lock endpoint returns an error', async () => {
    http
      .github()
      .intercept({path: '/repos/acme/widgets/issues/123/lock', method: 'PUT'})
      .reply(403, {message: 'forbidden'}, {headers: {'content-type': 'application/json'}})

    const {lockPullRequest} = loadModule()
    await expect(lockPullRequest()).resolves.toBeUndefined()
  })
})
