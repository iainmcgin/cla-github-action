import * as core from '@actions/core'
import { context } from '@actions/github'
import { checkAllowList } from './checkAllowList'
import getCommitters from './graphql'
import {
  ClaFileContent,
  ClafileContentAndSha,
  CommitterMap,
  Committer,
  ReactedCommitterMap
} from './interfaces'
import {
  createFile,
  getFileContent,
  updateFile
} from './persistence/persistence'
import prCommentSetup from './pullrequest/pullRequestComment'
import { reRunLastWorkFlowIfRequired } from './pullRerunRunner'
import { errorMessage, errorStatus } from './shared/errors'

export async function setupClaCheck() {
  let committerMap = getInitialCommittersMap()

  let committers = await getCommitters()
  committers = includePullRequestOpener(committers)
  committers = checkAllowList(committers)

  const { claFileContent, sha } = (await getCLAFileContentandSHA(
    committers,
    committerMap
  )) as ClafileContentAndSha

  committerMap = prepareCommiterMap(committers, claFileContent) as CommitterMap

  try {
    const reactedCommitters = (await prCommentSetup(
      committerMap,
      committers
    )) as ReactedCommitterMap

    if (reactedCommitters?.newSigned.length) {
      /* pushing the recently signed  contributors to the CLA Json File */
      await updateFile(sha, claFileContent, reactedCommitters)
    }
    if (
      reactedCommitters?.allSignedFlag ||
      committerMap?.notSigned === undefined ||
      committerMap.notSigned.length === 0
    ) {
      core.info(`All contributors have signed the CLA 📝 ✅ `)
      // reRunLastWorkFlowIfRequired is best-effort: its failure should not
      // fail the CLA check (we already know all contributors signed).
      try {
        await reRunLastWorkFlowIfRequired()
      } catch (err) {
        core.warning(
          `Best-effort rerun of prior workflow failed: ${errorMessage(err)}`
        )
      }
      return
    } else {
      core.setFailed(
        `Committers of Pull Request number ${context.issue.number} have to sign the CLA 📝`
      )
    }
  } catch (err) {
    core.setFailed(`Could not update the JSON file: ${errorMessage(err)}`)
  }
}

async function getCLAFileContentandSHA(
  committers: Committer[],
  committerMap: CommitterMap
): Promise<void | ClafileContentAndSha> {
  let result, claFileContentString, claFileContent, sha
  try {
    result = await getFileContent()
  } catch (error) {
    if (errorStatus(error) === 404) {
      return createClaFileAndPRComment(committers, committerMap)
    } else {
      throw new Error(
        `Could not retrieve repository contents. Status: ${errorStatus(error) ?? 'unknown'}`
      )
    }
  }
  sha = result?.data?.sha
  claFileContentString = Buffer.from(result.data.content, 'base64').toString()
  claFileContent = JSON.parse(claFileContentString)
  return { claFileContent, sha }
}

async function createClaFileAndPRComment(
  committers: Committer[],
  committerMap: CommitterMap
): Promise<void> {
  committerMap.notSigned = committers
  committerMap.signed = []
  committers.map(committer => {
    if (!committer.id) {
      committerMap.unknown.push(committer)
    }
  })

  const initialContent = { signedContributors: [] }
  const initialContentString = JSON.stringify(initialContent, null, 3)
  const initialContentBinary =
    Buffer.from(initialContentString).toString('base64')

  await createFile(initialContentBinary).catch((error: unknown) =>
    core.setFailed(
      `Error occurred when creating the signed contributors file: ${errorMessage(error)}. Make sure the branch where signatures are stored is NOT protected.`
    )
  )
  await prCommentSetup(committerMap, committers)
  throw new Error(
    `Committers of pull request ${context.issue.number} have to sign the CLA`
  )
}

function prepareCommiterMap(
  committers: Committer[],
  claFileContent: ClaFileContent
): CommitterMap {
  let committerMap = getInitialCommittersMap()

  committerMap.notSigned = committers.filter(
    committer =>
      !claFileContent?.signedContributors.some(cla => committer.id === cla.id)
  )
  committerMap.signed = committers.filter(committer =>
    claFileContent?.signedContributors.some(cla => committer.id === cla.id)
  )
  committers.map(committer => {
    if (!committer.id) {
      committerMap.unknown.push(committer)
    }
  })
  return committerMap
}

const getInitialCommittersMap = (): CommitterMap => ({
  signed: [],
  notSigned: [],
  unknown: []
})

/**
 * Prepend the PR opener to the committer set if they are not already present
 * via a commit or Co-authored-by trailer. The PR submitter is a contributor
 * to the merge in their own right and must sign the CLA, even if every commit
 * was authored by someone else.
 */
function includePullRequestOpener(committers: Committer[]): Committer[] {
  const opener = context.payload.pull_request?.user as
    | { id?: number; login?: string }
    | undefined
  if (!opener?.id || !opener.login) return committers
  if (committers.some(c => c.id === opener.id)) return committers
  return [
    {
      name: opener.login,
      id: opener.id,
      pullRequestNo: context.issue.number
    },
    ...committers
  ]
}
