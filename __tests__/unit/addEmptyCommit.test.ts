import {captureJson, installMockAgent, MockAgentHarness} from '../testHelpers/mockAgent'
import {resetEnv, setDefaultInputs, setInput} from '../testHelpers/env'
import {reloadOctokit, setContext} from '../testHelpers/context'

const modulePath = require.resolve('../../src/addEmptyCommit')
function loadModule() {
  reloadOctokit()
  delete require.cache[modulePath]
  return require('../../src/addEmptyCommit') as typeof import('../../src/addEmptyCommit')
}

function intercept(http: MockAgentHarness, method: string, path: string, body: any) {
  http
    .github()
    .intercept({path, method})
    .reply(200, body, {headers: {'content-type': 'application/json'}})
}

describe('addEmptyCommit', () => {
  let http: MockAgentHarness
  beforeEach(() => {
    setDefaultInputs()
    http = installMockAgent()
    setContext({
      issueNumber: 7,
      payload: {
        issue: {number: 7},
        comment: {
          body: 'I have read the CLA Document and I hereby sign the CLA',
          user: {login: 'alice'}
        }
      }
    })
  })
  afterEach(async () => {
    await http.close()
    resetEnv()
  })

  it('walks getPR -> getCommit -> getTree -> createCommit -> updateRef, threading SHAs', async () => {
    intercept(http, 'GET', '/repos/acme/widgets/pulls/7', {
      head: {sha: 'headsha', ref: 'feature/cla'}
    })
    intercept(http, 'GET', '/repos/acme/widgets/git/commits/headsha', {
      tree: {sha: 'treesha'}
    })
    intercept(http, 'GET', '/repos/acme/widgets/git/trees/treesha', {sha: 'treesha'})
    const created = captureJson(
      http.github(),
      {path: '/repos/acme/widgets/git/commits', method: 'POST'},
      {status: 201, body: {sha: 'newcommitsha'}}
    )
    const updated = captureJson(
      http.github(),
      {path: '/repos/acme/widgets/git/refs/heads%2Ffeature%2Fcla', method: 'PATCH'},
      {status: 200, body: {}}
    )

    const {addEmptyCommit} = loadModule()
    await addEmptyCommit()

    expect(created.body.tree).toBe('treesha')
    expect(created.body.parents).toEqual(['headsha'])
    expect(created.body.message).toBe('alice has signed the CLA')
    expect(updated.body.sha).toBe('newcommitsha')
    http.assertClean()
  })

  it('honours the signed-commit-message template', async () => {
    setInput('signed-commit-message', 'signed by $contributorName')
    intercept(http, 'GET', '/repos/acme/widgets/pulls/7', {
      head: {sha: 'headsha', ref: 'feature/cla'}
    })
    intercept(http, 'GET', '/repos/acme/widgets/git/commits/headsha', {
      tree: {sha: 'treesha'}
    })
    intercept(http, 'GET', '/repos/acme/widgets/git/trees/treesha', {sha: 'treesha'})
    const created = captureJson(
      http.github(),
      {path: '/repos/acme/widgets/git/commits', method: 'POST'},
      {status: 201, body: {sha: 'newcommitsha'}}
    )
    intercept(
      http,
      'PATCH',
      '/repos/acme/widgets/git/refs/heads%2Ffeature%2Fcla',
      {}
    )

    const {addEmptyCommit} = loadModule()
    await addEmptyCommit()
    expect(created.body.message).toBe('signed by alice')
  })

  it('is a no-op when the PR comment does not match the sign phrase', async () => {
    setContext({
      issueNumber: 7,
      payload: {
        issue: {number: 7},
        comment: {body: 'LGTM', user: {login: 'alice'}}
      }
    })
    const {addEmptyCommit} = loadModule()
    await addEmptyCommit()
    // No interceptors registered -> if the code called any HTTP endpoint,
    // MockAgent would reject with a "pending interceptor" error.
    http.assertClean()
  })
})
