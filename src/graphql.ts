import { octokit } from './octokit'
import { context } from '@actions/github'
import { Committer } from './interfaces'
import { errorMessage } from './shared/errors'

interface GraphQLUser {
  id?: string
  databaseId?: number
  login?: string
}
interface GraphQLActor {
  email?: string
  name?: string
  login?: string
  databaseId?: number
  user?: GraphQLUser | null
}
interface GraphQLCommit {
  author?: GraphQLActor
  committer?: GraphQLActor
}
interface GraphQLEdge {
  node: { commit: GraphQLCommit }
  cursor: string
}
interface GraphQLResponse {
  repository: {
    pullRequest: {
      commits: {
        totalCount: number
        edges: GraphQLEdge[]
        pageInfo: { endCursor: string | null; hasNextPage: boolean }
      }
    }
  }
}

const GITHUB_ACTIONS_BOT_ID = 41898282
const COMMITS_QUERY = `
query($owner:String! $name:String! $number:Int! $cursor:String){
    repository(owner: $owner, name: $name) {
        pullRequest(number: $number) {
            commits(first: 100, after: $cursor) {
                totalCount
                edges {
                    node {
                        commit {
                            author {
                                email
                                name
                                user { id databaseId login }
                            }
                            committer {
                                name
                                user { id databaseId login }
                            }
                        }
                    }
                    cursor
                }
                pageInfo { endCursor hasNextPage }
            }
        }
    }
}`

export default async function getCommitters(): Promise<Committer[]> {
  try {
    const seenKeys = new Set<string>()
    const committers: Committer[] = []
    let cursor: string | null = null
    let hasNextPage = true

    while (hasNextPage) {
      const response = (await octokit.graphql(COMMITS_QUERY, {
        owner: context.repo.owner,
        name: context.repo.repo,
        number: context.issue.number,
        cursor
      })) as GraphQLResponse

      const page = response.repository.pullRequest.commits
      for (const edge of page.edges) {
        const commit = edge.node.commit
        const linkedUser = commit.author?.user || commit.committer?.user
        // Fall back to the raw author/committer actor for the display name +
        // the email that will be surfaced when no GitHub user is linked.
        const rawActor = commit.author || commit.committer || {}
        const isLinked = Boolean(linkedUser?.databaseId)
        const user: Committer = {
          name: linkedUser?.login || rawActor.name || rawActor.email || '',
          id: linkedUser?.databaseId || 0,
          pullRequestNo: context.issue.number,
          ...(isLinked ? {} : { email: rawActor.email })
        }
        // Dedup by (id, email) so two commits from the same unlinked address
        // collapse but two different unlinked addresses don't.
        const key = `${user.id}:${user.email ?? ''}:${user.name}`
        if (!seenKeys.has(key)) {
          seenKeys.add(key)
          committers.push(user)
        }
      }
      cursor = page.pageInfo.endCursor
      hasNextPage = page.pageInfo.hasNextPage
    }

    return committers.filter(c => c.id !== GITHUB_ACTIONS_BOT_ID)
  } catch (e) {
    throw new Error(
      `graphql call to get the committers details failed: ${errorMessage(e)}`
    )
  }
}
