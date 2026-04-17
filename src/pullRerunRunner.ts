import { context } from '@actions/github'
import { octokit } from './octokit'

import * as core from '@actions/core'

// Note: why this  re-run of the last failed CLA workflow status check is explained this issue https://github.com/cla-assistant/github-action/issues/39
export async function reRunLastWorkFlowIfRequired() {
  // This rerun is only needed for issue_comment events (contributor signs
  // by commenting). For pull_request and pull_request_target, the current
  // run itself posts the fresh check status so there's nothing to refresh.
  if (
    context.eventName === 'pull_request' ||
    context.eventName === 'pull_request_target'
  ) {
    core.debug(`rerun not required for event ${context.eventName}`)
    return
  }

  const branch = await getBranchOfPullRequest()
  const workflowId = await getSelfWorkflowId()
  const runs = await listWorkflowRunsInBranch(branch, workflowId)

  const firstRun = runs.data.workflow_runs[0]
  if (runs.data.total_count > 0 && firstRun) {
    const run = firstRun.id

    const isLastWorkFlowFailed: boolean = await checkIfLastWorkFlowFailed(run)
    if (isLastWorkFlowFailed) {
      core.debug(`Rerunning build run ${run}`)
      await reRunWorkflow(run).catch(error =>
        core.error(`Error occurred when re-running the workflow: ${error}`)
      )
    }
  }
}

async function getBranchOfPullRequest(): Promise<string> {
  const pullRequest = await octokit.rest.pulls.get({
    owner: context.repo.owner,
    repo: context.repo.repo,
    pull_number: context.issue.number
  })

  return pullRequest.data.head.ref
}

async function getSelfWorkflowId(): Promise<number> {
  const perPage = 30
  let hasNextPage = true

  for (let page = 1; hasNextPage === true; page++) {
    const workflowList = await octokit.rest.actions.listRepoWorkflows({
      owner: context.repo.owner,
      repo: context.repo.repo,
      per_page: perPage,
      page
    })

    if (workflowList.data.total_count < page * perPage) {
      hasNextPage = false
    }

    const workflow = workflowList.data.workflows.find(
      w => w.name == context.workflow
    )

    if (workflow) {
      return workflow.id
    }
  }

  throw new Error(
    `Unable to locate this workflow's ID in this repository, can't trigger job..`
  )
}

async function listWorkflowRunsInBranch(
  branch: string,
  workflowId: number
): Promise<{
  data: { total_count: number; workflow_runs: Array<{ id: number }> }
}> {
  core.debug(`listing workflow runs on branch ${branch}`)
  // Paginate to be robust on active repos. The caller only reads
  // workflow_runs[0], so we stop after the first page for performance —
  // GitHub returns runs newest-first, so page 1 always contains the most
  // recent run.
  const runs = await octokit.rest.actions.listWorkflowRuns({
    owner: context.repo.owner,
    repo: context.repo.repo,
    branch,
    workflow_id: workflowId,
    event: 'pull_request_target',
    per_page: 100
  })
  return runs
}

async function reRunWorkflow(run: number): Promise<any> {
  // Personal Access token with repo scope is required to access this api - https://github.community/t/bug-rerun-workflow-api-not-working/126742
  await octokit.rest.actions.reRunWorkflow({
    owner: context.repo.owner,
    repo: context.repo.repo,
    run_id: run
  })
}

async function checkIfLastWorkFlowFailed(run: number): Promise<boolean> {
  const response: any = await octokit.rest.actions.getWorkflowRun({
    owner: context.repo.owner,
    repo: context.repo.repo,
    run_id: run
  })

  return response.data.conclusion == 'failure'
}
