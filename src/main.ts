import { context } from '@actions/github'
import { setupClaCheck } from './setupClaCheck'
import {
  lockPullRequest,
  unlockPullRequest
} from './pullrequest/pullRequestLock'

import * as core from '@actions/core'
import * as input from './shared/getInputs'

export async function run() {
  try {
    core.info(`CLA Assistant GitHub Action bot has started the process`)

    if (
      context.payload.action === 'closed' &&
      input.lockPullRequestAfterMerge()
    ) {
      if (context.payload.pull_request?.merged) {
        return lockPullRequest()
      }
      core.info(
        `Pull request ${context.issue.number} was closed without merging, not locking it`
      )
      return
    }

    // A merged PR can never be reopened, so a lock seen here is either left
    // over from the pre-v3.1 lock-on-any-close bug or was set manually by a
    // maintainer. We cannot tell the two apart, and the CLA check cannot
    // complete on a locked PR (the bot cannot comment), so we accept removing
    // a manual lock as the cost of unsticking the common case.
    if (
      context.payload.action === 'reopened' &&
      context.payload.pull_request?.locked &&
      input.lockPullRequestAfterMerge()
    ) {
      await unlockPullRequest()
    }

    await setupClaCheck()
  } catch (error) {
    if (error instanceof Error) core.setFailed(error.message)
  }
}

if (process.env.NODE_ENV !== 'test') {
  run()
}
