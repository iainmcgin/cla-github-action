import { octokit } from '../octokit'
import { context } from '@actions/github'
import {
  CommitterMap,
  CommittersDetails,
  ReactedCommitterMap
} from '../interfaces'
import { getUseDcoFlag, getCustomPrSignComment } from '../shared/getInputs'

import * as core from '@actions/core'

export default async function signatureWithPRComment(
  committerMap: CommitterMap,
  committers: CommittersDetails[]
): Promise<ReactedCommitterMap> {
  let repoId = context.payload.repository!.id
  const allComments = await octokit.paginate(octokit.rest.issues.listComments, {
    owner: context.repo.owner,
    repo: context.repo.repo,
    issue_number: context.issue.number,
    per_page: 100
  })
  let listOfPRComments = [] as CommittersDetails[]
  let filteredListOfPRComments = [] as CommittersDetails[]

  for (const prComment of allComments) {
    listOfPRComments.push({
      name: prComment.user!.login,
      id: prComment.user!.id,
      comment_id: prComment.id,
      body: prComment.body?.trim().toLowerCase(),
      created_at: prComment.created_at,
      repoId: repoId,
      pullRequestNo: context.issue.number
    })
  }
  for (const comment of listOfPRComments) {
    if (isCommentSignedByUser(comment.body || '', comment.name)) {
      const { body: _, ...withoutBody } = comment
      filteredListOfPRComments.push(withoutBody)
    }
  }
  /*
   *checking if the reacted committers are not the signed committers(not in the storage file) and filtering only the unsigned committers
   */
  const newSigned = filteredListOfPRComments.filter(commentedCommitter =>
    committerMap.notSigned.some(
      notSignedCommitter => commentedCommitter.id === notSignedCommitter.id
    )
  )

  /*
   * checking if the commented users are only the contributors who has committed in the same PR (This is needed for the PR Comment and changing the status to success when all the contributors has reacted to the PR)
   */
  const onlyCommitters = committers.filter((committer: CommittersDetails) =>
    filteredListOfPRComments.some(
      commentedCommitter => committer.id == commentedCommitter.id
    )
  )
  const commentedCommitterMap: ReactedCommitterMap = {
    newSigned,
    onlyCommitters,
    allSignedFlag: false
  }

  return commentedCommitterMap
}

function isCommentSignedByUser(
  comment: string,
  commentAuthor: string
): boolean {
  if (commentAuthor === 'github-actions[bot]') {
    return false
  }
  if (getCustomPrSignComment() !== '') {
    return getCustomPrSignComment().toLowerCase() === comment
  }
  const signaturePattern = getUseDcoFlag()
    ? /^.*i \s*have \s*read \s*the \s*dco \s*document \s*and \s*i \s*hereby \s*sign \s*the \s*dco.*$/
    : /^.*i \s*have \s*read \s*the \s*cla \s*document \s*and \s*i \s*hereby \s*sign \s*the \s*cla.*$/
  return comment.match(signaturePattern) !== null
}
