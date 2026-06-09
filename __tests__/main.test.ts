import * as core from '@actions/core'
import * as github from '@actions/github'
import { context } from '@actions/github'
import { setupClaCheck } from '../src/setupClaCheck'
import {
  lockPullRequest,
  unlockPullRequest
} from '../src/pullrequest/pullRequestLock'
import { run } from '../src/main'

jest.mock('@actions/core')
jest.mock('@actions/github')
jest.mock('../src/pullrequest/pullRequestLock')
jest.mock('../src/setupClaCheck')
const mockedGetClas = jest.mocked(setupClaCheck)
const mockedLockPullRequest = jest.mocked(lockPullRequest)
const mockedUnlockPullRequest = jest.mocked(unlockPullRequest)
const mockedCoreGetInput = jest.mocked(core.getInput)

describe('Pull request event', () => {
  beforeEach(async () => {
    mockedGetClas.mockReset()
    mockedLockPullRequest.mockReset()
    mockedUnlockPullRequest.mockReset()
    mockedCoreGetInput.mockImplementation((name: string) =>
      name === 'lock-pullrequest-aftermerge' ? 'true' : ''
    )
    // @ts-ignore
    github.context = {
      eventName: 'pull_request',
      ref: 'refs/pull/232/merge',
      workflow: 'CLA Assistant',
      action: 'ibakshaygithub-action-1',
      actor: 'ibakshay',
      payload: {
        action: 'closed',
        number: '1',
        pull_request: {
          number: 1,
          title: 'test',
          merged: true,
          locked: false,
          user: {
            login: 'ibakshay'
          }
        },
        repository: {
          name: 'auto-assign',
          owner: {
            login: 'ibakshay'
          }
        }
      },
      repo: {
        owner: 'ibakshay',
        repo: 'auto-assign'
      },
      issue: {
        owner: 'kentaro-m',
        repo: 'auto-assign',
        number: 1
      },
      sha: ''
    }
  })

  test('the lockPullRequest  method should be called if there is a pull request merge/closed', async () => {
    await run()
    expect(mockedLockPullRequest).toHaveBeenCalled()
  })

  test('the checkcla  method should not called if there is a pull request merge/closed', async () => {
    await run()
    expect(mockedGetClas).not.toHaveBeenCalled()
  })

  test('the lockPullRequest method should not be called if the pull request was closed without merging', async () => {
    github.context.payload.pull_request!.merged = false
    await run()
    expect(mockedLockPullRequest).not.toHaveBeenCalled()
    expect(mockedGetClas).not.toHaveBeenCalled()
  })

  test('the unlockPullRequest method should be called if a locked pull request is reopened', async () => {
    github.context.payload.action = 'reopened'
    github.context.payload.pull_request!.locked = true
    await run()
    expect(mockedUnlockPullRequest).toHaveBeenCalled()
    expect(mockedGetClas).toHaveBeenCalled()
  })

  test('the unlockPullRequest method should not be called if an unlocked pull request is reopened', async () => {
    github.context.payload.action = 'reopened'
    await run()
    expect(mockedUnlockPullRequest).not.toHaveBeenCalled()
    expect(mockedGetClas).toHaveBeenCalled()
  })

  test('the unlockPullRequest method should not be called if lock-pullrequest-aftermerge is disabled', async () => {
    mockedCoreGetInput.mockImplementation(() => 'false')
    github.context.payload.action = 'reopened'
    github.context.payload.pull_request!.locked = true
    await run()
    expect(mockedUnlockPullRequest).not.toHaveBeenCalled()
    expect(mockedGetClas).toHaveBeenCalled()
  })

  test('the checkcla method should be called on a merged/closed pull request if lock-pullrequest-aftermerge is disabled', async () => {
    mockedCoreGetInput.mockImplementation(() => 'false')
    await run()
    expect(mockedLockPullRequest).not.toHaveBeenCalled()
    expect(mockedGetClas).toHaveBeenCalled()
  })

  test('an issue_comment event without a pull_request payload runs the CLA check without locking or unlocking', async () => {
    github.context.eventName = 'issue_comment'
    github.context.payload.action = 'created'
    delete github.context.payload.pull_request
    await run()
    expect(mockedLockPullRequest).not.toHaveBeenCalled()
    expect(mockedUnlockPullRequest).not.toHaveBeenCalled()
    expect(mockedGetClas).toHaveBeenCalled()
  })

  test('the lockPullRequest  method should not be called if there is a pull request opened', async () => {
    github.context.payload.action = 'opened'
    await run()

    expect(mockedLockPullRequest).not.toHaveBeenCalled()
  })

  test('the checkcla  method should  be called if there is a pull request opened', async () => {
    github.context.payload.action = 'opened'
    await run()
    expect(mockedGetClas).toHaveBeenCalled()
  })

  test('the lockPullRequest  method should not be called if there is a pull request sync', async () => {
    github.context.payload.action = 'synchronize'

    await run()

    expect(mockedLockPullRequest).not.toHaveBeenCalled()
  })

  test('the checkcla  method should  be called if there is a pull request sync', async () => {
    github.context.payload.action = 'synchronize'
    await run()
    expect(mockedGetClas).toHaveBeenCalled()
  })
})
