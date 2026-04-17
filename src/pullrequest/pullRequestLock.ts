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
