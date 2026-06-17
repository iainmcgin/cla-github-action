import { octokit } from '../octokit'
import { context } from '@actions/github'
import {
  Committer,
  CommitterMap,
  ReactedCommitterMap,
  SigningComment
} from '../interfaces'
import { getPrSignComment } from '../shared/pr-sign-comment'

export default async function signatureWithPRComment(
  committerMap: CommitterMap,
  committers: Committer[]
): Promise<ReactedCommitterMap> {
  const repoId = context.payload.repository?.id
  const allComments = await octokit.paginate(octokit.rest.issues.listComments, {
    owner: context.repo.owner,
    repo: context.repo.repo,
    issue_number: context.issue.number,
    per_page: 100
  })
  const listOfPRComments: SigningComment[] = []
  const filteredListOfPRComments: SigningComment[] = []

  for (const prComment of allComments) {
    if (!prComment.user) continue
    listOfPRComments.push({
      name: prComment.user.login,
      id: prComment.user.id,
      comment_id: prComment.id,
      body: prComment.body ?? '',
      created_at: prComment.created_at,
      repoId,
      pullRequestNo: context.issue.number
    })
  }
  for (const comment of listOfPRComments) {
    if (isCommentSignedByUser(comment.body ?? '', comment.name)) {
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
  const onlyCommitters = committers.filter(committer =>
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

export function isCommentSignedByUser(
  comment: string,
  commentAuthor: string
): boolean {
  if (commentAuthor === 'github-actions[bot]') {
    return false
  }
  return commentContainsSignature(comment, getPrSignComment())
}

/** Any extra text in the comment must not exceed the phrase length, with a
 * small absolute floor so that very short custom phrases still tolerate a
 * brief remark such as `recheck` on a separate line. */
const MIN_EXTRA_TEXT_ALLOWANCE = 32

/** Placeholder for a Markdown blockquote line in the normalised body so that
 * the phrase block can never match across, or onto, a quoted line. */
const QUOTE_LINE = '\0'

/**
 * Decide whether a PR comment counts as signing the CLA/DCO.
 *
 * The configured sign phrase must appear, verbatim, as a contiguous block of
 * lines in the comment, with each phrase line being the only content of the
 * matching comment line (case-insensitive; runs of whitespace collapsed;
 * trailing `.` or `!` ignored; blank lines skipped). A comment line that
 * begins with a Markdown quote marker (`>`) is never treated as a match,
 * because quoted text is attributed to whoever is being quoted, not to the
 * comment author. The phrase must also make up the bulk of the comment —
 * any extra text may be at most `max(phrase.length, MIN_EXTRA_TEXT_ALLOWANCE)`
 * characters — so a short addition is tolerated but the declaration cannot
 * be buried inside a longer message.
 */
export function commentContainsSignature(
  commentBody: string,
  signPhrase: string
): boolean {
  const collapse = (s: string): string =>
    s.replace(/\s+/g, ' ').trim().toLowerCase()
  const normLine = (s: string): string => collapse(s.replace(/[.!]+\s*$/, ''))

  const phraseLines = signPhrase
    .split(/\r?\n/)
    .map(normLine)
    .filter(l => l !== '')
  if (phraseLines.length === 0) {
    return false
  }

  const bodyLines = commentBody
    .split(/\r?\n/)
    .map(l => (l.trimStart().startsWith('>') ? QUOTE_LINE : normLine(l)))
    .filter(l => l !== '')

  const hasOwnBlock = bodyLines.some(
    (_, i) =>
      i + phraseLines.length <= bodyLines.length &&
      phraseLines.every((pl, k) => bodyLines[i + k] === pl)
  )
  if (!hasOwnBlock) {
    return false
  }

  const phraseLen = collapse(signPhrase).length
  const bodyLen = collapse(commentBody).length
  const allowance = Math.max(phraseLen, MIN_EXTRA_TEXT_ALLOWANCE)
  return bodyLen <= phraseLen + allowance
}
