import { resetEnv, setInput } from '../testHelpers/env'
import * as inputs from '../../src/shared/getInputs'

describe('getInputs wrappers', () => {
  afterEach(resetEnv)

  const stringInputs: Array<[keyof typeof inputs, string]> = [
    ['getRemoteRepoName', 'remote-repository-name'],
    ['getRemoteOrgName', 'remote-organization-name'],
    ['getPathToSignatures', 'path-to-signatures'],
    ['getPathToDocument', 'path-to-document'],
    ['getBranch', 'branch'],
    ['getAllowListItem', 'allowlist'],
    ['getSignedCommitMessage', 'signed-commit-message'],
    ['getCreateFileCommitMessage', 'create-file-commit-message'],
    ['getCustomNotSignedPrComment', 'custom-notsigned-prcomment'],
    ['getCustomAllSignedPrComment', 'custom-allsigned-prcomment'],
    ['getCustomPrSignComment', 'custom-pr-sign-comment']
  ]
  const booleanInputs: Array<[keyof typeof inputs, string]> = [
    ['getUseDcoFlag', 'use-dco-flag'],
    ['lockPullRequestAfterMerge', 'lock-pullrequest-aftermerge'],
    ['suggestRecheck', 'suggest-recheck']
  ]

  it.each(stringInputs)(
    '%s reads the "%s" action input as a string',
    (fn, inputName) => {
      setInput(inputName, 'expected-value')
      expect((inputs[fn] as () => string)()).toBe('expected-value')
    }
  )

  it.each(booleanInputs)('%s parses "%s" as a boolean', (fn, inputName) => {
    setInput(inputName, 'true')
    expect((inputs[fn] as () => boolean)()).toBe(true)
    setInput(inputName, 'false')
    expect((inputs[fn] as () => boolean)()).toBe(false)
    setInput(inputName, 'TRUE')
    expect((inputs[fn] as () => boolean)()).toBe(true)
    setInput(inputName, '')
    expect((inputs[fn] as () => boolean)()).toBe(false)
  })

  it('returns an empty string when the input is unset', () => {
    expect(inputs.getBranch()).toBe('')
  })

  it('trims whitespace around the input value (core.getInput behaviour)', () => {
    setInput('branch', '  main  ')
    expect(inputs.getBranch()).toBe('main')
  })
})
