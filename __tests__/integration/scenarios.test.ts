import * as core from '@actions/core'
import { installFakeGitHub, FakeGitHub } from '../testHelpers/fakeGithub'
import { resetEnv, setDefaultInputs, setInput } from '../testHelpers/env'
import { reloadOctokit, setContext } from '../testHelpers/context'

async function runAction() {
  reloadOctokit()
  for (const path of Object.keys(require.cache)) {
    if (path.includes('/src/')) delete require.cache[path]
  }
  const { run } = require('../../src/main') as typeof import('../../src/main')
  await run()
}

/** Install spies on core.setFailed / core.info. Returns accessors. */
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

describe('CLA action end-to-end scenarios', () => {
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

  it('PR opened by an unsigned contributor: posts notice, fails check', async () => {
    const watch = watchCore()
    fake.repo('acme', 'widgets').addPullRequest({
      number: 7,
      head: { sha: 'headsha', ref: 'feature/cla' },
      commits: [{ author: { login: 'alice', id: 1001 } }]
    })
    fake
      .repo('acme', 'widgets')
      .setFile('signatures/cla.json', { signedContributors: [] })

    setContext({
      owner: 'acme',
      repo: 'widgets',
      issueNumber: 7,
      actor: 'alice',
      eventName: 'pull_request_target',
      payload: {
        pull_request: { number: 7, state: 'open' },
        repository: { id: fake.repo('acme', 'widgets').state.id },
        action: 'opened'
      }
    })

    await runAction()

    const comments = fake.repo('acme', 'widgets').listComments(7)
    expect(comments).toHaveLength(1)
    expect(comments[0]!.body).toMatch(/CLA Assistant Lite bot/)

    expect(watch.failures.join('\n')).toMatch(
      /Committers of Pull Request number 7/
    )
    watch.restore()
  })

  it('Contributor posts the sign phrase: signatures file updated, bot comment marks all signed', async () => {
    fake.repo('acme', 'widgets').addPullRequest({
      number: 7,
      head: { sha: 'headsha', ref: 'feature/cla' },
      commits: [{ author: { login: 'alice', id: 1001 } }]
    })
    fake
      .repo('acme', 'widgets')
      .setFile('signatures/cla.json', { signedContributors: [] })
    // Existing bot comment + the user's signing comment.
    fake.repo('acme', 'widgets').addComment(7, {
      body: 'something **CLA Assistant Lite bot** says',
      user: { login: 'github-actions[bot]', id: 41898282 }
    })
    fake.repo('acme', 'widgets').addComment(7, {
      body: 'I have read the CLA Document and I hereby sign the CLA',
      user: { login: 'alice', id: 1001 }
    })
    fake
      .repo('acme', 'widgets')
      .addWorkflow('cla-check', [{ id: 777, conclusion: 'failure' }])

    setContext({
      owner: 'acme',
      repo: 'widgets',
      issueNumber: 7,
      actor: 'alice',
      eventName: 'issue_comment',
      payload: {
        action: 'created',
        issue: { number: 7, pull_request: {} },
        comment: {
          body: 'I have read the CLA Document and I hereby sign the CLA',
          user: { login: 'alice', id: 1001 }
        },
        repository: { id: fake.repo('acme', 'widgets').state.id }
      }
    })

    await runAction()

    const sigFile = fake
      .repo('acme', 'widgets')
      .getFile('signatures/cla.json') as any
    expect(sigFile.signedContributors.map((c: any) => c.name)).toContain(
      'alice'
    )

    const bot = fake
      .repo('acme', 'widgets')
      .listComments(7)
      .find(c => c.user.login === 'github-actions[bot]')!
    expect(bot.body).toMatch(/all contributors have signed the cla/i)

    expect(fake.recordedRerunRequests).toEqual([
      { owner: 'acme', repo: 'widgets', runId: 777 }
    ])
  })

  it('Already-signed contributor opens a PR with no prior bot comment: posts an all-signed comment, file untouched', async () => {
    const watch = watchCore()
    fake.repo('acme', 'widgets').addPullRequest({
      number: 8,
      head: { sha: 'headsha', ref: 'feature/again' },
      commits: [{ author: { login: 'alice', id: 1001 } }]
    })
    fake.repo('acme', 'widgets').setFile('signatures/cla.json', {
      signedContributors: [
        {
          name: 'alice',
          id: 1001,
          comment_id: 99,
          created_at: '2024-01-01',
          repoId: 1,
          pullRequestNo: 3
        }
      ]
    })

    setContext({
      owner: 'acme',
      repo: 'widgets',
      issueNumber: 8,
      actor: 'alice',
      eventName: 'pull_request_target',
      payload: {
        pull_request: { number: 8, state: 'open' },
        repository: { id: fake.repo('acme', 'widgets').state.id },
        action: 'opened'
      }
    })

    await runAction()

    // File untouched.
    const sigFile = fake
      .repo('acme', 'widgets')
      .getFile('signatures/cla.json') as any
    expect(sigFile.signedContributors).toHaveLength(1)
    // All-signed bot comment posted.
    const comments = fake.repo('acme', 'widgets').listComments(8)
    expect(
      comments.some(c => /all contributors have signed the cla/i.test(c.body))
    ).toBe(true)
    expect(watch.failures).toEqual([])
    watch.restore()
  })

  it('Dependabot PR: allow-listed, skipped entirely, check passes', async () => {
    fake.repo('acme', 'widgets').addPullRequest({
      number: 9,
      head: { sha: 'headsha', ref: 'deps/bump' },
      commits: [{ author: { login: 'dependabot[bot]', id: 49699333 } }]
    })
    fake
      .repo('acme', 'widgets')
      .setFile('signatures/cla.json', { signedContributors: [] })

    setContext({
      owner: 'acme',
      repo: 'widgets',
      issueNumber: 9,
      actor: 'dependabot[bot]',
      eventName: 'pull_request_target',
      payload: {
        pull_request: { number: 9, state: 'open' },
        repository: { id: fake.repo('acme', 'widgets').state.id },
        action: 'opened'
      }
    })

    await runAction()

    // No signatures recorded (allowlist short-circuits).
    const sigFile = fake
      .repo('acme', 'widgets')
      .getFile('signatures/cla.json') as any
    expect(sigFile.signedContributors).toEqual([])
  })

  it('Merged PR: lock endpoint is called when lock-pullrequest-aftermerge is true', async () => {
    setInput('lock-pullrequest-aftermerge', 'true')

    setContext({
      owner: 'acme',
      repo: 'widgets',
      issueNumber: 10,
      eventName: 'pull_request',
      payload: { action: 'closed', pull_request: { number: 10, merged: true } }
    })

    await runAction()

    expect(fake.recordedLocks).toEqual([
      { owner: 'acme', repo: 'widgets', issue: 10 }
    ])
  })

  it('Remote signatures repo: reads and writes hit the configured remote org/repo', async () => {
    setInput('remote-organization-name', 'other-org')
    setInput('remote-repository-name', 'sig-store')

    fake.repo('acme', 'widgets').addPullRequest({
      number: 11,
      head: { sha: 'headsha', ref: 'feat/x' },
      commits: [{ author: { login: 'alice', id: 1001 } }]
    })
    fake
      .repo('other-org', 'sig-store')
      .setFile('signatures/cla.json', { signedContributors: [] })

    setContext({
      owner: 'acme',
      repo: 'widgets',
      issueNumber: 11,
      actor: 'alice',
      eventName: 'pull_request_target',
      payload: {
        pull_request: { number: 11, state: 'open' },
        repository: { id: fake.repo('acme', 'widgets').state.id },
        action: 'opened'
      }
    })

    const watch = watchCore()
    await runAction()

    expect(watch.failures.join('\n')).toMatch(
      /Committers of Pull Request number 11/
    )
    // No file in the main repo (persistence went to the remote repo only).
    expect(
      fake.repo('acme', 'widgets').getFile('signatures/cla.json')
    ).toBeUndefined()
    // Remote file is still empty (unsigned contributor didn't sign).
    expect(
      (
        fake
          .repo('other-org', 'sig-store')
          .getFile('signatures/cla.json') as any
      ).signedContributors
    ).toEqual([])
    watch.restore()
  })

  it('PR with a commit authored by an email not linked to any GitHub user: posts the unlinked-email warning', async () => {
    const watch = watchCore()
    fake.repo('acme', 'widgets').addPullRequest({
      number: 12,
      head: { sha: 'headsha', ref: 'feature/email' },
      // No `login` / `id` — this maps to an unknown committer in the action.
      commits: [
        { author: { name: 'Mystery Contributor', email: 'typo@example.com' } }
      ]
    })
    fake
      .repo('acme', 'widgets')
      .setFile('signatures/cla.json', { signedContributors: [] })

    setContext({
      owner: 'acme',
      repo: 'widgets',
      issueNumber: 12,
      actor: 'mystery',
      eventName: 'pull_request_target',
      payload: {
        pull_request: { number: 12, state: 'open' },
        repository: { id: fake.repo('acme', 'widgets').state.id },
        action: 'opened'
      }
    })

    await runAction()

    const comments = fake.repo('acme', 'widgets').listComments(12)
    expect(comments).toHaveLength(1)
    const body = comments[0]!.body
    // The warning block, the email, and both remediation paths.
    expect(body).toContain('[!WARNING]')
    expect(body).toContain('typo@example.com')
    expect(body).toContain('github.com/settings/emails')
    expect(body).toContain('Rewrite the commits')
    // Still marked failed — the action cannot tell whether this committer
    // has signed.
    expect(watch.failures.join('\n')).toMatch(
      /Committers of Pull Request number 12/
    )
    watch.restore()
  })

  it('PR opener who did not author any commit is required to sign', async () => {
    const watch = watchCore()
    // Commits authored by bob only; alice is the PR opener.
    fake.repo('acme', 'widgets').addPullRequest({
      number: 13,
      head: { sha: 'headsha', ref: 'feature/opener' },
      commits: [{ author: { login: 'bob', id: 2002 } }]
    })
    // Bob has already signed; alice has not.
    fake.repo('acme', 'widgets').setFile('signatures/cla.json', {
      signedContributors: [{ name: 'bob', id: 2002 }]
    })

    setContext({
      owner: 'acme',
      repo: 'widgets',
      issueNumber: 13,
      actor: 'alice',
      eventName: 'pull_request_target',
      payload: {
        action: 'opened',
        pull_request: {
          number: 13,
          state: 'open',
          user: { login: 'alice', id: 1001 }
        },
        repository: { id: fake.repo('acme', 'widgets').state.id }
      }
    })

    await runAction()

    const comments = fake.repo('acme', 'widgets').listComments(13)
    expect(comments).toHaveLength(1)
    expect(comments[0]!.body).toContain(':x: @alice')
    expect(watch.failures.join('\n')).toMatch(
      /Committers of Pull Request number 13/
    )
    watch.restore()
  })

  it('Co-authored-by trailers count as committers', async () => {
    const watch = watchCore()
    // Commit authored by alice, co-authored by bob (via noreply id form).
    fake.repo('acme', 'widgets').addPullRequest({
      number: 14,
      head: { sha: 'headsha', ref: 'feature/coauthor' },
      commits: [
        {
          author: { login: 'alice', id: 1001 },
          message:
            'Implement thing\n\nBody of commit.\n\nCo-authored-by: Bob <2002+bob@users.noreply.github.com>'
        }
      ]
    })
    // Alice has signed; bob has not.
    fake.repo('acme', 'widgets').setFile('signatures/cla.json', {
      signedContributors: [{ name: 'alice', id: 1001 }]
    })

    setContext({
      owner: 'acme',
      repo: 'widgets',
      issueNumber: 14,
      actor: 'alice',
      eventName: 'pull_request_target',
      payload: {
        action: 'opened',
        pull_request: {
          number: 14,
          state: 'open',
          user: { login: 'alice', id: 1001 }
        },
        repository: { id: fake.repo('acme', 'widgets').state.id }
      }
    })

    await runAction()

    const comments = fake.repo('acme', 'widgets').listComments(14)
    expect(comments).toHaveLength(1)
    const body = comments[0]!.body
    // Alice shows as signed, bob as unsigned.
    expect(body).toContain(
      ':white_check_mark: [alice](https://github.com/alice)'
    )
    expect(body).toContain(':x: @bob')
    expect(watch.failures.join('\n')).toMatch(
      /Committers of Pull Request number 14/
    )
    watch.restore()
  })

  it('Co-authored-by trailer with a non-noreply email routes to the unlinked-email warning', async () => {
    const watch = watchCore()
    fake.repo('acme', 'widgets').addPullRequest({
      number: 15,
      head: { sha: 'headsha', ref: 'feature/coauthor-email' },
      commits: [
        {
          author: { login: 'alice', id: 1001 },
          message: 'Fix\n\nCo-authored-by: Carol <carol@example.com>'
        }
      ]
    })
    fake.repo('acme', 'widgets').setFile('signatures/cla.json', {
      signedContributors: [{ name: 'alice', id: 1001 }]
    })

    setContext({
      owner: 'acme',
      repo: 'widgets',
      issueNumber: 15,
      actor: 'alice',
      eventName: 'pull_request_target',
      payload: {
        action: 'opened',
        pull_request: {
          number: 15,
          state: 'open',
          user: { login: 'alice', id: 1001 }
        },
        repository: { id: fake.repo('acme', 'widgets').state.id }
      }
    })

    await runAction()

    const body = fake.repo('acme', 'widgets').listComments(15)[0]!.body
    expect(body).toContain('[!WARNING]')
    expect(body).toContain('carol@example.com')
    watch.restore()
  })

  it('PR opener absent from all commit authors: hard-fails by default with an impersonation-guard CAUTION', async () => {
    const watch = watchCore()
    // Alice opens the PR; all commits are attributed to bob.
    fake.repo('acme', 'widgets').addPullRequest({
      number: 16,
      head: { sha: 'headsha', ref: 'feature/cherry' },
      commits: [{ author: { login: 'bob', id: 2002 } }]
    })
    // Both alice and bob have already signed — so the only failure path open
    // is the opener-not-in-authors check itself.
    fake.repo('acme', 'widgets').setFile('signatures/cla.json', {
      signedContributors: [
        { name: 'alice', id: 1001 },
        { name: 'bob', id: 2002 }
      ]
    })

    setContext({
      owner: 'acme',
      repo: 'widgets',
      issueNumber: 16,
      actor: 'alice',
      eventName: 'pull_request_target',
      payload: {
        action: 'opened',
        pull_request: {
          number: 16,
          state: 'open',
          user: { login: 'alice', id: 1001 }
        },
        repository: { id: fake.repo('acme', 'widgets').state.id }
      }
    })

    await runAction()

    expect(watch.failures.join('\n')).toMatch(
      /Pull Request opener @alice is not recorded/
    )
    const body = fake.repo('acme', 'widgets').listComments(16)[0]!.body
    expect(body).toContain('[!CAUTION]')
    expect(body).toContain('@alice')
    expect(body).toContain('@bob')
    watch.restore()
  })

  it('PR opener absent from all commit authors with require-opener-as-author=false: no hard fail, NOTE block only', async () => {
    const watch = watchCore()
    setInput('require-opener-as-author', 'false')

    fake.repo('acme', 'widgets').addPullRequest({
      number: 17,
      head: { sha: 'headsha', ref: 'feature/cherry' },
      commits: [{ author: { login: 'bob', id: 2002 } }]
    })
    fake.repo('acme', 'widgets').setFile('signatures/cla.json', {
      signedContributors: [
        { name: 'alice', id: 1001 },
        { name: 'bob', id: 2002 }
      ]
    })

    setContext({
      owner: 'acme',
      repo: 'widgets',
      issueNumber: 17,
      actor: 'alice',
      eventName: 'pull_request_target',
      payload: {
        action: 'opened',
        pull_request: {
          number: 17,
          state: 'open',
          user: { login: 'alice', id: 1001 }
        },
        repository: { id: fake.repo('acme', 'widgets').state.id }
      }
    })

    await runAction()

    expect(watch.failures).toEqual([])
    const body = fake.repo('acme', 'widgets').listComments(17)[0]!.body
    expect(body).toContain('[!NOTE]')
    expect(body).not.toContain('[!CAUTION]')
    watch.restore()
  })
})
