import {resetEnv, setDefaultInputs, setInput} from '../testHelpers/env'
import {commentContent} from '../../src/pullrequest/pullRequestCommentContent'
import {CommitterMap} from '../../src/interfaces'

function committerMap(overrides: Partial<CommitterMap> = {}): CommitterMap {
  return {
    signed: [],
    notSigned: [],
    unknown: [],
    ...overrides
  }
}

describe('commentContent (CLA mode)', () => {
  beforeEach(() => setDefaultInputs())
  afterEach(resetEnv)

  it('renders the "all signed" message with the bot signature', () => {
    const body = commentContent(true, committerMap())
    expect(body).toMatch(/all contributors have signed the cla/i)
    expect(body).toContain('CLA Assistant Lite bot')
  })

  it('honours a custom all-signed message', () => {
    setInput('custom-allsigned-prcomment', 'Cheers — everyone signed.')
    const body = commentContent(true, committerMap())
    expect(body).toContain('Cheers — everyone signed.')
    expect(body).toContain('CLA Assistant Lite bot')
  })

  it('renders an unsigned-contributors list with tick and cross markers', () => {
    const body = commentContent(
      false,
      committerMap({
        signed: [{name: 'alice', id: 1, pullRequestNo: 7}],
        notSigned: [{name: 'bob', id: 2, pullRequestNo: 7}]
      })
    )
    expect(body).toContain('1** out of **2** committers have signed')
    expect(body).toContain(':white_check_mark:')
    expect(body).toContain('alice')
    expect(body).toContain(':x: @bob')
  })

  it('uses singular "you" language when only one committer', () => {
    const body = commentContent(
      false,
      committerMap({notSigned: [{name: 'bob', id: 2, pullRequestNo: 7}]})
    )
    expect(body).toContain('ask that you sign')
  })

  it('uses plural "you all" language when multiple committers', () => {
    const body = commentContent(
      false,
      committerMap({
        signed: [{name: 'alice', id: 1, pullRequestNo: 7}],
        notSigned: [{name: 'bob', id: 2, pullRequestNo: 7}]
      })
    )
    expect(body).toContain('ask that you all sign')
  })

  it('mentions unknown (non-GitHub-user) committers separately', () => {
    const body = commentContent(
      false,
      committerMap({unknown: [{name: 'typo@example.com', id: 0, pullRequestNo: 7}]})
    )
    expect(body).toContain('typo@example.com')
    expect(body).toContain('seems not to be a GitHub user')
  })

  it('adds the "recheck" hint when suggest-recheck is true', () => {
    setInput('suggest-recheck', 'true')
    const body = commentContent(false, committerMap())
    expect(body).toContain('retrigger this bot by commenting **recheck**')
  })
})

describe('commentContent (DCO mode)', () => {
  beforeEach(() => {
    setDefaultInputs({'use-dco-flag': 'true'})
  })
  afterEach(resetEnv)

  it('uses DCO wording and the DCO bot signature', () => {
    const body = commentContent(true, committerMap())
    expect(body).toContain('DCO')
    expect(body).toContain('DCO Assistant Lite bot')
    expect(body).not.toContain('CLA Assistant Lite bot')
  })
})
