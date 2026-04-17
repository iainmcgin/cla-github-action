import {captureJson, installMockAgent, MockAgentHarness} from '../testHelpers/mockAgent'
import {resetEnv, setDefaultInputs} from '../testHelpers/env'
import {reloadOctokit, setContext} from '../testHelpers/context'

const modulePath = require.resolve('../../src/pullRerunRunner')
function loadModule() {
  reloadOctokit()
  delete require.cache[modulePath]
  return require('../../src/pullRerunRunner') as typeof import('../../src/pullRerunRunner')
}

function json(http: MockAgentHarness, method: string, path: string, body: any, status = 200) {
  http
    .github()
    .intercept({path, method})
    .reply(status, body, {headers: {'content-type': 'application/json'}})
}

describe('reRunLastWorkFlowIfRequired', () => {
  let http: MockAgentHarness

  beforeEach(() => {
    setDefaultInputs()
    http = installMockAgent()
  })
  afterEach(async () => {
    await http.close()
    resetEnv()
  })

  it('no-ops for pull_request events', async () => {
    setContext({eventName: 'pull_request'})
    const {reRunLastWorkFlowIfRequired} = loadModule()
    await reRunLastWorkFlowIfRequired()
    http.assertClean()
  })

  it('no-ops for pull_request_target events', async () => {
    setContext({eventName: 'pull_request_target'})
    const {reRunLastWorkFlowIfRequired} = loadModule()
    await reRunLastWorkFlowIfRequired()
    http.assertClean()
  })

  it('for issue_comment: locates the workflow, finds the last run, and reruns it if failed', async () => {
    setContext({eventName: 'issue_comment', issueNumber: 9, payload: {}})
    // @ts-ignore — workflow name is read from context
    require('@actions/github').context.workflow = 'cla-check'

    json(http, 'GET', '/repos/acme/widgets/pulls/9', {head: {ref: 'feature/cla'}})
    json(http, 'GET', '/repos/acme/widgets/actions/workflows?per_page=30&page=1', {
      total_count: 1,
      workflows: [{id: 12345, name: 'cla-check'}]
    })
    json(
      http,
      'GET',
      '/repos/acme/widgets/actions/workflows/12345/runs?branch=feature%2Fcla&event=pull_request_target',
      {total_count: 1, workflow_runs: [{id: 777}]}
    )
    json(http, 'GET', '/repos/acme/widgets/actions/runs/777', {conclusion: 'failure'})
    const rerun = captureJson(
      http.github(),
      {path: '/repos/acme/widgets/actions/runs/777/rerun', method: 'POST'},
      {status: 201, body: ''}
    )

    const {reRunLastWorkFlowIfRequired} = loadModule()
    await reRunLastWorkFlowIfRequired()
    expect(rerun.rawBody === undefined || rerun.rawBody === '').toBe(true)
    http.assertClean()
  })

  it('does not rerun when the last workflow conclusion is success', async () => {
    setContext({eventName: 'issue_comment', issueNumber: 9, payload: {}})
    // @ts-ignore
    require('@actions/github').context.workflow = 'cla-check'

    json(http, 'GET', '/repos/acme/widgets/pulls/9', {head: {ref: 'feature/cla'}})
    json(http, 'GET', '/repos/acme/widgets/actions/workflows?per_page=30&page=1', {
      total_count: 1,
      workflows: [{id: 12345, name: 'cla-check'}]
    })
    json(
      http,
      'GET',
      '/repos/acme/widgets/actions/workflows/12345/runs?branch=feature%2Fcla&event=pull_request_target',
      {total_count: 1, workflow_runs: [{id: 777}]}
    )
    json(http, 'GET', '/repos/acme/widgets/actions/runs/777', {conclusion: 'success'})

    const {reRunLastWorkFlowIfRequired} = loadModule()
    await reRunLastWorkFlowIfRequired()
    http.assertClean()
  })
})
