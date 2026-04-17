import { resetEnv, setInput } from '../testHelpers/env'
import { checkAllowList } from '../../src/checkAllowList'
import { CommittersDetails } from '../../src/interfaces'

function committer(name: string): CommittersDetails {
  return { name, id: 0, pullRequestNo: 1 }
}

describe('checkAllowList', () => {
  afterEach(resetEnv)

  it('filters out committers whose login matches an exact allow-list entry', () => {
    setInput('allowlist', 'alice,bob')
    const result = checkAllowList([committer('alice'), committer('carol')])
    expect(result.map(c => c.name)).toEqual(['carol'])
  })

  it('filters out committers matching a glob pattern', () => {
    setInput('allowlist', '*[bot]')
    const result = checkAllowList([
      committer('dependabot[bot]'),
      committer('renovate[bot]'),
      committer('alice')
    ])
    expect(result.map(c => c.name)).toEqual(['alice'])
  })

  it('supports a prefix glob', () => {
    setInput('allowlist', 'acme-*')
    const result = checkAllowList([
      committer('acme-bot'),
      committer('acme-svc'),
      committer('widgets-bot')
    ])
    expect(result.map(c => c.name)).toEqual(['widgets-bot'])
  })

  it('treats regex metacharacters in patterns as literal', () => {
    setInput('allowlist', 'user.name+tag')
    expect(
      checkAllowList([
        committer('user.name+tag'),
        committer('userXnameYtag')
      ]).map(c => c.name)
    ).toEqual(['userXnameYtag'])
  })

  it('trims whitespace around comma-separated entries', () => {
    setInput('allowlist', ' alice , bob ')
    expect(
      checkAllowList([
        committer('alice'),
        committer('bob'),
        committer('carol')
      ]).map(c => c.name)
    ).toEqual(['carol'])
  })

  it('returns an empty list when every committer is allow-listed', () => {
    setInput('allowlist', 'alice,bob')
    expect(checkAllowList([committer('alice'), committer('bob')])).toEqual([])
  })

  it('returns the full list when the allow-list does not match anyone', () => {
    setInput('allowlist', 'zack')
    const committers = [committer('alice'), committer('bob')]
    expect(checkAllowList(committers)).toEqual(committers)
  })

  it('skips null/undefined committers', () => {
    setInput('allowlist', '')
    const result = checkAllowList([
      committer('alice'),
      null as unknown as CommittersDetails,
      undefined as unknown as CommittersDetails
    ])
    expect(result.map(c => c.name)).toEqual(['alice'])
  })

  it('with an empty allow-list input still filters out committers matching the literal empty pattern only if login is exactly empty', () => {
    setInput('allowlist', '')
    expect(
      checkAllowList([committer(''), committer('alice')]).map(c => c.name)
    ).toEqual(['alice'])
  })
})
