import * as core from '@actions/core'

export const getRemoteRepoName = (): string => {
  return core.getInput('remote-repository-name', { required: false })
}

export const getRemoteOrgName = (): string => {
  return core.getInput('remote-organization-name', { required: false })
}

export const getPathToSignatures = (): string =>
  core.getInput('path-to-signatures', { required: false })

export const getPathToDocument = (): string =>
  core.getInput('path-to-document', { required: false })

export const getBranch = (): string =>
  core.getInput('branch', { required: false })

export const getAllowListItem = (): string =>
  core.getInput('allowlist', { required: false })

export const getSignedCommitMessage = (): string =>
  core.getInput('signed-commit-message', { required: false })

export const getCreateFileCommitMessage = (): string =>
  core.getInput('create-file-commit-message', { required: false })

export const getCustomNotSignedPrComment = (): string =>
  core.getInput('custom-notsigned-prcomment', { required: false })

export const getCustomAllSignedPrComment = (): string =>
  core.getInput('custom-allsigned-prcomment', { required: false })

export const getUseDcoFlag = (): boolean => getBooleanInput('use-dco-flag')

export const getCustomPrSignComment = (): string =>
  core.getInput('custom-pr-sign-comment', { required: false })

export const lockPullRequestAfterMerge = (): boolean =>
  getBooleanInput('lock-pullrequest-aftermerge')

export const suggestRecheck = (): boolean => getBooleanInput('suggest-recheck')

/**
 * Whether the PR opener must be recorded as an author or co-author of at
 * least one commit in the PR. When true (the default), an opener who is not
 * in the authorship trail causes the check to fail — a guard against
 * impersonation of an attacker-submitted patch attributed to a trusted
 * identity. Opt out by setting 'false' if your workflow involves submitters
 * who legitimately push commits authored by others (cherry-picks, release
 * engineers applying accepted patches, mailing-list-style patch submission).
 */
export const requireOpenerAsAuthor = (): boolean =>
  getBooleanInput('require-opener-as-author', true)

/**
 * Parses the action input as a boolean, tolerating unset / empty. Actions
 * accept only strings; 'true' / 'false' (case-insensitive) are the supported
 * values. Anything else falls back to `fallback` (default false), so an
 * unset input preserves the semantics the caller wants.
 */
function getBooleanInput(name: string, fallback = false): boolean {
  const raw = core.getInput(name, { required: false }).toLowerCase().trim()
  if (raw === 'true') return true
  if (raw === 'false') return false
  return fallback
}
