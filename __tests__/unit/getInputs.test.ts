import {resetEnv, setInput} from '../testHelpers/env'
import * as inputs from '../../src/shared/getInputs'

describe('getInputs wrappers', () => {
  afterEach(resetEnv)

  it.each<[keyof typeof inputs, string]>([
    ['getRemoteRepoName', 'remote-repository-name'],
    ['getRemoteOrgName', 'remote-organization-name'],
    ['getPathToSignatures', 'path-to-signatures'],
    ['getPathToDocument', 'path-to-document'],
    ['getBranch', 'branch'],
    ['getAllowListItem', 'allowlist'],
    ['getEmptyCommitFlag', 'empty-commit-flag'],
    ['getSignedCommitMessage', 'signed-commit-message'],
    ['getCreateFileCommitMessage', 'create-file-commit-message'],
    ['getCustomNotSignedPrComment', 'custom-notsigned-prcomment'],
    ['getCustomAllSignedPrComment', 'custom-allsigned-prcomment'],
    ['getUseDcoFlag', 'use-dco-flag'],
    ['getCustomPrSignComment', 'custom-pr-sign-comment'],
    ['lockPullRequestAfterMerge', 'lock-pullrequest-aftermerge'],
    ['suggestRecheck', 'suggest-recheck']
  ])('%s reads the "%s" action input', (fn, inputName) => {
    setInput(inputName, 'expected-value')
    expect((inputs[fn] as () => string)()).toBe('expected-value')
  })

  it('returns an empty string when the input is unset', () => {
    expect(inputs.getBranch()).toBe('')
  })

  it('trims whitespace around the input value (core.getInput behaviour)', () => {
    setInput('branch', '  main  ')
    expect(inputs.getBranch()).toBe('main')
  })
})
