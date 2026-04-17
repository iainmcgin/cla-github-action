# Improvement Plan

Derived from the code review performed 2026-04-17. Each phase is independently
shippable and passes the full test suite (currently 74 tests across 13 suites)
plus the `pre- vs post-refactor regression` comparison.

## Ground rules
- Keep each phase ≤ 250 LOC net change wherever feasible.
- Every bug fix adds a regression test.
- Rebuild `dist/index.js` at the end of any phase that touches `src/`.
- Run the regression comparison test before committing each phase.

---

## Phase 1 — Bug fixes

- **C1**: fix `error.status === "404"` → `error.status === 404` in
  `setupClaCheck.ts`, so `createClaFileAndPRComment` runs when the signatures
  file does not yet exist. Add integration scenario that starts with no file.
- **C2**: replace the in-place `delete filteredListOfPRComments[i].body` loop in
  `signatureComment.ts` with a non-mutating map.
- **C3**: make `prCommentSetup` post an `all signed` comment when there is no
  prior bot comment and every committer is already signed, instead of
  silently no-op'ing. Update the existing `already-signed` scenario.
- **H2**: rename/invert `isUserNotInAllowList` so the name matches the
  semantics, drop the dead `!== undefined` guard.
- **H7-link**: fix the broken Markdown link syntax
  `(${name})[https://github.com/${name}]` → `[${name}](https://github.com/${name})`.
- **M2**: replace stray `console.debug(branch)` with `core.debug(...)`.
- **M5**: drop the `.replace(/ /g, '')` whitespace-crunch on the GraphQL query
  string in `graphql.ts`.

## Phase 2 — Type cleanup

- **H4**: in `tsconfig.json`, remove `"noImplicitAny": false` and
  `"useUnknownInCatchVariables": false`. Fix fallout — implicit-any params and
  `catch (error)` narrowing.
- **H5**: delete unused interfaces (`CommentedCommitterMap`, `LabelName`,
  `CommittersCommentDetails`). Introduce `ClaFileContent` and `Signature`
  interfaces and use them everywhere `any` is shorthand for the signatures
  file shape.
- **L3**: tighten `Promise<any>` return types on `persistence.ts` functions to
  the octokit response types (or `Promise<void>` where callers ignore the
  return).

## Phase 3 — TypeScript 5 upgrade

- Bump `typescript` `^4.9.4` → `^5.7.x`, `@types/jest` `^29` → `^30`. Confirm
  `@types/node` remains `^20`.
- Turn on `"noUncheckedIndexedAccess": true` and
  `"exactOptionalPropertyTypes": true` in `tsconfig.json`; address fallout.
- Regenerate `dist/index.js` and confirm no new deprecation warnings.

## Phase 4 — Structural

- **H1**: collapse `src/octokit.ts` into a single lazy factory that validates
  the token on first use. Remove the eager `octokit` singleton; update
  callers to use the factory. Tests no longer need `require.cache` deletions.
- **H6**: extract a `resolveSignaturesTarget()` helper in `persistence.ts`
  that returns `{octokit, owner, repo, path, branch}`. Reduces the three
  copy-pasted bodies to one.
- **H3**: replace string-typed booleans with `core.getBooleanInput()` in
  `src/shared/getInputs.ts` (at least `use-dco-flag`,
  `lock-pullrequest-aftermerge`, `empty-commit-flag`, `suggest-recheck`).
  Update every call site to compare against `boolean`.
- **M3**: stop importing from `@actions/github/lib/utils`. Derive the
  `Octokit` instance type from the public surface of `@actions/github`.

## Phase 5 — Template consolidation

- **H7**: collapse `cla()` and `dco()` in `pullRequestCommentContent.ts` into
  a single parameterized renderer. Fix the `****DCO Assistant Lite bot****`
  vs `**CLA Assistant Lite bot**` asymmetry.

## Phase 6 — Pagination

- **M4**: add pagination to `listComments` (signatureComment.ts),
  `listWorkflowRuns` (pullRerunRunner.ts), and the GraphQL commits query
  (graphql.ts). Use `octokit.paginate()` where possible. Add a test per
  endpoint that spans two pages.

## Phase 7 — Tooling

- **M7**: add Prettier with a minimal config committed at repo root. Run once
  across the repo and commit the churn as a dedicated formatting-only commit.
- **M8**: add `@typescript-eslint` with the `recommended-requiring-type-checking`
  preset. Fix real findings. Make `npm run lint` a `scripts` entry.
- **M1**: investigate whether `addEmptyCommit` is dead code. Either delete it
  (and the `empty-commit-flag` input) or wire it into the sign-via-comment
  path and test it.
- **M9**: normalise logging conventions.
- **M10**: make `persistence.updateFile` return a new object instead of
  mutating the caller's `claFileContent`.

## Exit criteria
- All 74+ existing tests still pass on every phase boundary.
- The pre/post regression test (`preVsPostRegression.test.ts`) still finds the
  HTTP call set unchanged against the pre-refactor baseline — or, where a
  legitimate behaviour change is intentional (C1 creates an extra request, M4
  paginates), the test is updated with a note explaining the delta.
- `dist/index.js` builds cleanly and emits no Node deprecation warnings.
