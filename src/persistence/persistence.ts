import { context } from '@actions/github'

import { ClaFileContent, ReactedCommitterMap } from '../interfaces'
import { Octokit, getDefaultOctokitClient, getPATOctokit } from '../octokit'

import * as input from '../shared/getInputs'

interface SignaturesTarget {
  octokit: Octokit
  owner: string
  repo: string
  path: string
  branch: string
}

function resolveSignaturesTarget(): SignaturesTarget {
  const remote = Boolean(input.getRemoteRepoName() || input.getRemoteOrgName())
  return {
    octokit: remote ? getPATOctokit() : getDefaultOctokitClient(),
    owner: input.getRemoteOrgName() || context.repo.owner,
    repo: input.getRemoteRepoName() || context.repo.repo,
    path: input.getPathToSignatures(),
    branch: input.getBranch()
  }
}

export async function getFileContent(): Promise<any> {
  const t = resolveSignaturesTarget()
  return t.octokit.rest.repos.getContent({
    owner: t.owner,
    repo: t.repo,
    path: t.path,
    ref: t.branch
  })
}

export async function createFile(contentBinary: string): Promise<any> {
  const t = resolveSignaturesTarget()
  return t.octokit.rest.repos.createOrUpdateFileContents({
    owner: t.owner,
    repo: t.repo,
    path: t.path,
    message:
      input.getCreateFileCommitMessage() ||
      'Creating file for storing CLA Signatures',
    content: contentBinary,
    branch: t.branch
  })
}

export async function updateFile(
  sha: string,
  claFileContent: ClaFileContent,
  reactedCommitters: ReactedCommitterMap
): Promise<any> {
  const t = resolveSignaturesTarget()
  const pullRequestNo = context.issue.number

  claFileContent.signedContributors.push(...reactedCommitters.newSigned)
  const contentBinary = Buffer.from(JSON.stringify(claFileContent, null, 2)).toString('base64')

  await t.octokit.rest.repos.createOrUpdateFileContents({
    owner: t.owner,
    repo: t.repo,
    path: t.path,
    sha,
    message: buildSignedCommitMessage(pullRequestNo),
    content: contentBinary,
    branch: t.branch
  })
}

function buildSignedCommitMessage(pullRequestNo: number): string {
  const template = input.getSignedCommitMessage()
  const owner = context.issue.owner
  const repo = context.issue.repo
  if (!template) {
    return `@${context.actor} has signed the CLA in ${owner}/${repo}#${pullRequestNo}`
  }
  return template
    .replace('$contributorName', context.actor)
    .replace('$pullRequestNo', pullRequestNo.toString())
    .replace('$owner', owner)
    .replace('$repo', repo)
}
