# Changelog

All notable changes to this fork since it diverged from the upstream
`cla-assistant/github-action` project (archived). The branch point is commit
[`58daaf8`](../../commit/58daaf8) "Update README to reflect repository status".

This project does not yet follow Semantic Versioning; changes are grouped by
the logical unit of work. Each entry links to the commit that introduced it.

## Unreleased

### Added
- **Unit + integration test harness.** ~60 new tests across three layers:
  pure-logic units for `checkAllowList`, `getInputs`, `commentContent`, and
  `getPrSignComment`; per-module HTTP-level tests for `persistence`,
  `pullRequestComment`, `pullRequestLock`, `addEmptyCommit`, and
  `pullRerunRunner` using an `undici` `MockAgent`; six end-to-end scenarios
  driven by an in-memory `FakeGitHub` that covers unsigned-PR, sign-via-comment,
  already-signed, allow-listed bot, merged-PR lock, and remote-signatures-repo
  flows. ([`482990d`](../../commit/482990d))
- **Bundle smoke test.** Spawns `dist/index.js` as a subprocess against a real
  `http.Server`-backed fake for three end-to-end scenarios, catching any
  regression in how `ncc` bundles the action. ([`6210ee4`](../../commit/6210ee4))
- **Pre- vs post-refactor regression test.** Runs the pre-refactor `dist/index.js`
  (extracted from commit `eeb7f3f`) and the current `dist/index.js` against the
  same HTTP fake, asserts the set of recorded calls is identical across the
  three smoke scenarios. ([`8241668`](../../commit/8241668))

### Changed
- **Upgraded `@actions/github` from `^4.0.0` to `^6.0.1`** to silence two
  Node.js deprecation warnings — `DEP0169` (`url.parse()` in the bundled
  `@actions/http-client@1.x`) and `DEP0040` (`punycode` reached via
  `@octokit/request@5.x` → `node-fetch@2` → `whatwg-url@5` → `tr46@0`). v6
  pulls in `@actions/http-client@2.x` (WHATWG URL) and `@octokit/request@8.x`
  (uses `undici`). The v6 REST surface moved from `octokit.<resource>` to
  `octokit.rest.<resource>`, and Octokit response types are stricter, so all
  call sites in `addEmptyCommit.ts`, `persistence.ts`,
  `pullrequest/pullRequestComment.ts`, `pullrequest/pullRequestLock.ts`,
  `pullrequest/signatureComment.ts`, and `pullRerunRunner.ts` were updated,
  along with optional-chaining/non-null-assertion fixes where the new types
  required them. ([`7f32052`](../../commit/7f32052))
- **Bumped `@actions/core` `1.10.0` → `1.11.1`** and
  **`@types/node` `^18.x` → `^20.x`** (aligns with the Node 20+ runtime).
  ([`083debb`](../../commit/083debb))
- **Upgraded `husky` `4` → `9`.** Migrated the pre-commit hook from the
  legacy `husky` block in `package.json` to a `.husky/pre-commit` script, as
  required by husky 9, and moved the dep from `dependencies` to
  `devDependencies`. ([`ecdea08`](../../commit/ecdea08))
- **Added `@types/jest`** (`^29.x`, compatible with the current TypeScript
  `^4.9`) to restore compilation of the test suite, which had been silently
  failing. ([`7f32052`](../../commit/7f32052))
- **`src/main.ts`** skips its import-time `run()` invocation under
  `NODE_ENV=test` so the test harness can drive `run()` explicitly without
  double-invoking the action. ([`482990d`](../../commit/482990d))

### Removed
- **Dropped unused dependencies** `@octokit/rest`, `@octokit/types`,
  `actions-toolkit`, and `node-fetch`. None of these were imported from
  `src/` or the original test files; they were residue from an earlier shape
  of the action. ([`ecdea08`](../../commit/ecdea08))
- **Replaced `lodash` with a one-line inline `escapeRegExp`** helper in
  `checkAllowList.ts` — the only call site — and removed the dependency. This
  shrank the bundled `dist/index.js` from roughly 1.7 MB to 1.2 MB.
  ([`ecdea08`](../../commit/ecdea08))
- **Deleted `__tests__/pullRequestLock.test.ts`** which contained no
  tests — only a stale import block and a commented-out declaration.
  ([`7f32052`](../../commit/7f32052))

### Fixed
- **False-failure when all contributors have signed** — the action previously
  reported failure in this edge case. ([`eeb7f3f`](../../commit/eeb7f3f))
- **`__tests__/main.test.ts`** now compiles and runs: corrected import paths
  (`checkcla` → `setupClaCheck`, `pullRequestLock` →
  `pullrequest/pullRequestLock`), replaced the removed `ts-jest/utils`
  `mocked` helper with the built-in `jest.mocked`, and mocked `core.getInput`
  so the "merged PR" tests actually exercise the `lockPullRequest` branch.
  ([`7f32052`](../../commit/7f32052))

### Infrastructure
- **Bumped the GitHub Actions runtime to `node24`** in `action.yml`.
  ([`b3e568c`](../../commit/b3e568c))
- **Updated README** to reflect this fork's status and scope.
  ([`58daaf8`](../../commit/58daaf8))
