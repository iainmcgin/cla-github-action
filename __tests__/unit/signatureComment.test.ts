import { resetEnv, setInput } from '../testHelpers/env'
import {
  commentContainsSignature,
  isCommentSignedByUser
} from '../../src/pullrequest/signatureComment'

const CLA = 'I have read the CLA Document and I hereby sign the CLA'
const DCO = 'I have read the DCO Document and I hereby sign the DCO'

describe('commentContainsSignature', () => {
  describe('accepts', () => {
    it.each([
      ['exact phrase', CLA],
      ['surrounding whitespace', `\n  ${CLA}  \n`],
      ['lower case', CLA.toLowerCase()],
      [
        'extra internal whitespace',
        'I have read the  CLA  Document and I  hereby sign the CLA'
      ],
      ['trailing period', `${CLA}.`],
      ['trailing exclamation', `${CLA}!`],
      ['trailing period then recheck on a new line', `${CLA}.\n\nrecheck`],
      ['recheck on a new line', `${CLA}\nrecheck`],
      ['CRLF line endings', `${CLA}\r\nrecheck\r\n`],
      ['short greeting on its own line', `Hi,\n\n${CLA}`]
    ])('%s', (_, body) => {
      expect(commentContainsSignature(body, CLA)).toBe(true)
    })
  })

  describe('rejects', () => {
    it.each([
      ['empty body', ''],
      ['unrelated text', 'recheck'],
      ['phrase embedded mid-line', `Sure, ${CLA} — happy to help`],
      ['negated on the same line', `I have NOT ${CLA}`],
      ['phrase inside a markdown blockquote', `> ${CLA}`],
      [
        'extra text longer than the phrase',
        `${CLA}\n\n` +
          'And here is a paragraph of extra commentary that is clearly longer ' +
          'than the declaration itself and so should not be treated as a signature.'
      ],
      ['near-miss wording', 'I have read the CLA and I sign it']
    ])('%s', (_, body) => {
      expect(commentContainsSignature(body, CLA)).toBe(false)
    })

    it('rejects when the configured phrase is empty', () => {
      expect(commentContainsSignature('anything', '   ')).toBe(false)
    })
  })

  describe('extra-text allowance', () => {
    it('accepts extra text up to the phrase length', () => {
      const extra = 'x'.repeat(CLA.length - 1)
      expect(commentContainsSignature(`${CLA}\n${extra}`, CLA)).toBe(true)
    })

    it('rejects extra text just beyond the phrase length', () => {
      const extra = 'x'.repeat(CLA.length)
      expect(commentContainsSignature(`${CLA}\n${extra}`, CLA)).toBe(false)
    })

    it('still tolerates a short remark when the custom phrase is very short', () => {
      expect(commentContainsSignature('I agree\n\nrecheck', 'I agree')).toBe(
        true
      )
    })
  })

  describe('custom phrase', () => {
    it('applies the same own-line rule', () => {
      const phrase = 'I agree to the Developer Certificate of Origin'
      expect(commentContainsSignature(`${phrase}.\n\nrecheck`, phrase)).toBe(
        true
      )
      expect(commentContainsSignature(`well ${phrase} ok`, phrase)).toBe(false)
    })

    it('matches when the configured phrase itself ends in a period', () => {
      expect(commentContainsSignature('I agree.', 'I agree.')).toBe(true)
      expect(commentContainsSignature('I agree', 'I agree.')).toBe(true)
    })

    it('matches a multi-line custom phrase as a contiguous block', () => {
      const phrase = 'I have read the Contributor Terms.\nI sign the CLA.'
      expect(commentContainsSignature(phrase, phrase)).toBe(true)
      expect(commentContainsSignature(`${phrase}\n\nrecheck`, phrase)).toBe(
        true
      )
      expect(
        commentContainsSignature('I have read the Contributor Terms.', phrase)
      ).toBe(false)
    })

    it('does not let a multi-line phrase span a blockquote line', () => {
      const phrase = 'Line one\nLine two'
      expect(
        commentContainsSignature('Line one\n> something\nLine two', phrase)
      ).toBe(false)
    })
  })
})

describe('isCommentSignedByUser', () => {
  afterEach(resetEnv)

  it('ignores comments from github-actions[bot]', () => {
    expect(isCommentSignedByUser(CLA, 'github-actions[bot]')).toBe(false)
  })

  it('uses the CLA phrase by default', () => {
    expect(isCommentSignedByUser(CLA, 'alice')).toBe(true)
    expect(isCommentSignedByUser(DCO, 'alice')).toBe(false)
  })

  it('uses the DCO phrase when use-dco-flag is true', () => {
    setInput('use-dco-flag', 'true')
    expect(isCommentSignedByUser(DCO, 'alice')).toBe(true)
    expect(isCommentSignedByUser(CLA, 'alice')).toBe(false)
  })

  it('uses the custom phrase when configured', () => {
    setInput('custom-pr-sign-comment', 'I accept the terms')
    expect(isCommentSignedByUser('I accept the terms.', 'alice')).toBe(true)
    expect(isCommentSignedByUser(CLA, 'alice')).toBe(false)
  })
})
