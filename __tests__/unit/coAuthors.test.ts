import { parseCoAuthors } from '../../src/shared/coAuthors'

describe('parseCoAuthors', () => {
  it('extracts a single trailer from a conventional footer block', () => {
    const msg = [
      'Refactor signatures handling',
      '',
      'Details about the change.',
      '',
      'Co-authored-by: Alice Example <alice@example.com>'
    ].join('\n')
    expect(parseCoAuthors(msg)).toEqual([
      { name: 'Alice Example', email: 'alice@example.com' }
    ])
  })

  it('extracts multiple trailers and deduplicates by (name, email)', () => {
    const msg = [
      'Fix bug',
      '',
      'Co-authored-by: Alice <alice@example.com>',
      'Co-authored-by: Bob <bob@example.com>',
      'Co-authored-by: alice <alice@example.com>' // dup, case-insensitive
    ].join('\n')
    const result = parseCoAuthors(msg)
    expect(result.map(c => c.email)).toEqual([
      'alice@example.com',
      'bob@example.com'
    ])
  })

  it('is case-insensitive on the Co-authored-by key', () => {
    const msg = 'Title\n\nCO-AUTHORED-BY: Alice <a@example.com>'
    expect(parseCoAuthors(msg)).toHaveLength(1)
  })

  it('extracts login + numeric id from the modern noreply form', () => {
    const msg =
      'Title\n\nCo-authored-by: Alice <12345+alice@users.noreply.github.com>'
    expect(parseCoAuthors(msg)).toEqual([
      {
        name: 'Alice',
        email: '12345+alice@users.noreply.github.com',
        noreplyLogin: 'alice',
        noreplyId: 12345
      }
    ])
  })

  it('extracts login from the legacy noreply form (no id available)', () => {
    const msg =
      'Title\n\nCo-authored-by: Alice <alice@users.noreply.github.com>'
    expect(parseCoAuthors(msg)).toEqual([
      {
        name: 'Alice',
        email: 'alice@users.noreply.github.com',
        noreplyLogin: 'alice'
      }
    ])
  })

  it('returns an empty list when the message contains no trailers', () => {
    expect(parseCoAuthors('fix: one-liner commit')).toEqual([])
    expect(parseCoAuthors('')).toEqual([])
  })

  it('ignores malformed trailer-like lines', () => {
    const msg = [
      'Title',
      '',
      'Co-authored-by Alice <alice@example.com>', // no colon
      'Co-authored-by: Alice <not-an-email>',
      'Co-authored-by: <alice@example.com>' // no name
    ].join('\n')
    expect(parseCoAuthors(msg)).toEqual([])
  })

  it('handles CRLF line endings', () => {
    const msg = 'Title\r\n\r\nCo-authored-by: Alice <a@example.com>\r\n'
    expect(parseCoAuthors(msg)).toHaveLength(1)
  })
})
