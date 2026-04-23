import { resetEnv, setDefaultInputs, setInput } from '../testHelpers/env'
import { commentContent } from '../../src/pullrequest/pullRequestCommentContent'
import { CommitterMap } from '../../src/interfaces'

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
        signed: [{ name: 'alice', id: 1, pullRequestNo: 7 }],
        notSigned: [{ name: 'bob', id: 2, pullRequestNo: 7 }]
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
      committerMap({ notSigned: [{ name: 'bob', id: 2, pullRequestNo: 7 }] })
    )
    expect(body).toContain('ask that you sign')
  })

  it('uses plural "you all" language when multiple committers', () => {
    const body = commentContent(
      false,
      committerMap({
        signed: [{ name: 'alice', id: 1, pullRequestNo: 7 }],
        notSigned: [{ name: 'bob', id: 2, pullRequestNo: 7 }]
      })
    )
    expect(body).toContain('ask that you all sign')
  })

  describe('unlinked-email block', () => {
    it('surfaces a warning with the email and both fix options when exactly one commit has an unlinked author', () => {
      const body = commentContent(
        false,
        committerMap({
          unknown: [
            {
              name: 'Alice',
              id: 0,
              pullRequestNo: 7,
              email: 'alice@example.com'
            }
          ]
        })
      )
      expect(body).toContain('[!WARNING]')
      expect(body).toContain('1 commit in this PR was authored')
      expect(body).toContain('alice@example.com')
      // Both fix options must be present.
      expect(body).toContain('github.com/settings/emails')
      expect(body).toContain('Rewrite the commits')
      expect(body).toContain('git rebase -i --root')
    })

    it('uses plural phrasing for multiple unlinked authors and includes every email', () => {
      const body = commentContent(
        false,
        committerMap({
          unknown: [
            {
              name: 'Alice',
              id: 0,
              pullRequestNo: 7,
              email: 'alice@example.com'
            },
            { name: 'Bob', id: 0, pullRequestNo: 7, email: 'bob@example.com' }
          ]
        })
      )
      expect(body).toContain('2 commits in this PR were authored')
      expect(body).toContain('alice@example.com')
      expect(body).toContain('bob@example.com')
    })

    it('falls back to the committer name when the email is missing', () => {
      const body = commentContent(
        false,
        committerMap({
          unknown: [{ name: 'typo-name', id: 0, pullRequestNo: 7 }]
        })
      )
      expect(body).toContain('typo-name')
      // No email markdown / no backticks around missing email.
      expect(body).not.toMatch(/`<\s*>`/)
    })
  })

  it('adds the "recheck" hint when suggest-recheck is true', () => {
    setInput('suggest-recheck', 'true')
    const body = commentContent(false, committerMap())
    expect(body).toContain('retrigger this bot by commenting **recheck**')
  })
})

describe('commentContent (DCO mode)', () => {
  beforeEach(() => {
    setDefaultInputs({ 'use-dco-flag': 'true' })
  })
  afterEach(resetEnv)

  it('uses DCO wording and the DCO bot signature', () => {
    const body = commentContent(true, committerMap())
    expect(body).toContain('DCO')
    expect(body).toContain('DCO Assistant Lite bot')
    expect(body).not.toContain('CLA Assistant Lite bot')
  })
})
