import { octokit } from '../octokit'
import * as core from '@actions/core'
import { context } from '@actions/github'

export async function lockPullRequest() {
  const pullRequestNo = context.issue.number
  try {
    await octokit.rest.issues.lock({
      owner: context.repo.owner,
      repo: context.repo.repo,
      issue_number: pullRequestNo
    })
    core.info(
      `Locked pull request ${pullRequestNo} to safeguard CLA signatures`
    )
  } catch (e) {
    core.error(`Failed to lock pull request ${pullRequestNo}`)
  }
}

export async function unlockPullRequest() {
  const pullRequestNo = context.issue.number
  try {
    await octokit.rest.issues.unlock({
      owner: context.repo.owner,
      repo: context.repo.repo,
      issue_number: pullRequestNo
    })
    core.info(
      `Unlocked reopened pull request ${pullRequestNo} so the CLA check can proceed`
    )
  } catch (e) {
    core.error(
      `Failed to unlock pull request ${pullRequestNo}; the CLA check will likely fail because the bot cannot comment on a locked pull request. A maintainer should unlock the conversation manually.`
    )
  }
}
