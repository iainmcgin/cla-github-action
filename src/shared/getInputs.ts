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

export const getEmptyCommitFlag = (): boolean =>
  getBooleanInput('empty-commit-flag')

export const getSignedCommitMessage = (): string =>
  core.getInput('signed-commit-message', { required: false })

export const getCreateFileCommitMessage = (): string =>
  core.getInput('create-file-commit-message', { required: false })

export const getCustomNotSignedPrComment = (): string =>
  core.getInput('custom-notsigned-prcomment', { required: false })

export const getCustomAllSignedPrComment = (): string =>
  core.getInput('custom-allsigned-prcomment', { required: false })

export const getUseDcoFlag = (): boolean =>
  getBooleanInput('use-dco-flag')

export const getCustomPrSignComment = (): string =>
  core.getInput('custom-pr-sign-comment', { required: false })

export const lockPullRequestAfterMerge = (): boolean =>
  getBooleanInput('lock-pullrequest-aftermerge')

export const suggestRecheck = (): boolean =>
  getBooleanInput('suggest-recheck')

/**
 * Parses the action input as a boolean, tolerating unset / empty. Actions
 * accept only strings; 'true' / 'false' (case-insensitive) are the supported
 * values. Anything else — including an unset input — returns false.
 */
function getBooleanInput(name: string): boolean {
  const raw = core.getInput(name, { required: false }).toLowerCase().trim()
  return raw === 'true'
}
