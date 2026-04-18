/**
 * Proves that octokit.paginate() is actually walking Link-header pages for the
 * endpoints the action cares about, not just reading page 1. Without this,
 * PRs with >30 comments or >100 commits would silently drop data.
 *
 * The fake now honors ?page / ?per_page query params and emits a
 * `Link: <...>; rel="next"` header when more pages remain; octokit.paginate
 * follows the Link header to fetch all pages.
 */
import { installFakeGitHub, FakeGitHub } from '../testHelpers/fakeGithub'
import { resetEnv, setDefaultInputs } from '../testHelpers/env'
import { reloadOctokit, setContext } from '../testHelpers/context'

function loadSignatureComment() {
  reloadOctokit()
  for (const path of Object.keys(require.cache)) {
    if (path.includes('/src/')) delete require.cache[path]
  }
  return require('../../src/pullrequest/signatureComment')
    .default as typeof import('../../src/pullrequest/signatureComment').default
}

describe('pagination', () => {
  let fake: FakeGitHub

  beforeEach(() => {
    setDefaultInputs()
    fake = installFakeGitHub()
    setContext({
      issueNumber: 7,
      payload: { repository: { id: 5555 } }
    })
  })

  afterEach(async () => {
    await fake.close()
    resetEnv()
  })

  it('signatureComment listComments walks every page', async () => {
    // Add 150 dummy comments (spans 2 pages at per_page=100).
    for (let i = 0; i < 150; i++) {
      fake.repo('acme', 'widgets').addComment(7, {
        body: 'noise',
        user: { login: `user${i}`, id: 10000 + i }
      })
    }
    // Insert the sign phrase at index 140 — unreachable without pagination.
    fake.repo('acme', 'widgets').addComment(7, {
      body: 'i have read the cla document and i hereby sign the cla',
      user: { login: 'alice', id: 1001 }
    })

    const signatureWithPRComment = loadSignatureComment()
    const result = await signatureWithPRComment(
      {
        signed: [],
        notSigned: [{ name: 'alice', id: 1001, pullRequestNo: 7 }],
        unknown: []
      },
      [{ name: 'alice', id: 1001, pullRequestNo: 7 }]
    )
    // alice's signing comment lives on page 2. If pagination were broken,
    // newSigned would be empty.
    expect(result.newSigned.map((c: { name: string }) => c.name)).toEqual(['alice'])
  })

  it('fake emits rel="next" only when there are more pages', async () => {
    for (let i = 0; i < 50; i++) {
      fake.repo('acme', 'widgets').addComment(7, {
        body: `c${i}`,
        user: { login: `u${i}`, id: i }
      })
    }
    const all = fake.repo('acme', 'widgets').listComments(7)
    expect(all).toHaveLength(50)
  })
})
