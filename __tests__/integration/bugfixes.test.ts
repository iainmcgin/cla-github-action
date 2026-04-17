import * as core from '@actions/core'
import {installFakeGitHub, FakeGitHub} from '../testHelpers/fakeGithub'
import {resetEnv, setDefaultInputs} from '../testHelpers/env'
import {reloadOctokit, setContext} from '../testHelpers/context'

async function runAction() {
  reloadOctokit()
  for (const path of Object.keys(require.cache)) {
    if (path.includes('/src/')) delete require.cache[path]
  }
  const {run} = require('../../src/main') as typeof import('../../src/main')
  await run()
}

function watchCore() {
  const failed = jest.spyOn(core, 'setFailed').mockImplementation(() => {})
  const info = jest.spyOn(core, 'info').mockImplementation(() => {})
  return {
    get failures() {
      return failed.mock.calls.map(c => String(c[0]))
    },
    get infos() {
      return info.mock.calls.map(c => String(c[0]))
    },
    restore() {
      failed.mockRestore()
      info.mockRestore()
    }
  }
}

describe('bug fixes', () => {
  let fake: FakeGitHub
  beforeEach(() => {
    setDefaultInputs({
      'path-to-signatures': 'signatures/cla.json',
      branch: 'main',
      allowlist: '*[bot]'
    })
    fake = installFakeGitHub()
  })
  afterEach(async () => {
    await fake.close()
    resetEnv()
  })

  describe('C1: bootstrap of the signatures file from scratch', () => {
    it('creates the signatures file, posts the bot comment, and fails the check when no file exists yet', async () => {
      const watch = watchCore()
      fake.repo('acme', 'widgets').addPullRequest({
        number: 7,
        head: {sha: 'headsha', ref: 'feature/cla'},
        commits: [{author: {login: 'alice', id: 1001}}]
      })
      // No signatures file has been created yet.

      setContext({
        owner: 'acme',
        repo: 'widgets',
        issueNumber: 7,
        actor: 'alice',
        eventName: 'pull_request_target',
        payload: {
          pull_request: {number: 7, state: 'open'},
          repository: {id: fake.repo('acme', 'widgets').state.id},
          action: 'opened'
        }
      })

      await runAction()

      // The file should now exist with an empty signedContributors list.
      const sigFile = fake.repo('acme', 'widgets').getFile('signatures/cla.json') as any
      expect(sigFile).toEqual({signedContributors: []})

      // A bot comment should have been posted.
      const comments = fake.repo('acme', 'widgets').listComments(7)
      expect(comments).toHaveLength(1)
      expect(comments[0].body).toMatch(/CLA Assistant Lite bot/)

      // And the check should be marked failed.
      expect(watch.failures.join('\n')).toMatch(/Committers of pull request 7/)
      watch.restore()
    })
  })

  describe('C3: already-signed contributor with no prior bot comment gets feedback', () => {
    it('posts an "all signed" bot comment instead of a silent no-op', async () => {
      const watch = watchCore()
      fake.repo('acme', 'widgets').addPullRequest({
        number: 8,
        head: {sha: 'headsha', ref: 'feature/again'},
        commits: [{author: {login: 'alice', id: 1001}}]
      })
      fake.repo('acme', 'widgets').setFile('signatures/cla.json', {
        signedContributors: [
          {name: 'alice', id: 1001, comment_id: 99, created_at: '2024-01-01', repoId: 1, pullRequestNo: 3}
        ]
      })

      setContext({
        owner: 'acme',
        repo: 'widgets',
        issueNumber: 8,
        actor: 'alice',
        eventName: 'pull_request_target',
        payload: {
          pull_request: {number: 8, state: 'open'},
          repository: {id: fake.repo('acme', 'widgets').state.id},
          action: 'opened'
        }
      })

      await runAction()

      const comments = fake.repo('acme', 'widgets').listComments(8)
      expect(comments).toHaveLength(1)
      expect(comments[0].body).toMatch(/all contributors have signed the cla/i)
      expect(watch.failures).toEqual([])
      watch.restore()
    })
  })
})
