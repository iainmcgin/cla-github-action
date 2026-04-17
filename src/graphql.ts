import { octokit } from './octokit'
import { context } from '@actions/github'
import { CommittersDetails } from './interfaces'
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

export default async function getCommitters(): Promise<CommittersDetails[]> {
  try {
    const seenNames = new Set<string>()
    const committers: CommittersDetails[] = []
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
        const actor = extractUserFromCommit(edge.node.commit)
        const user: CommittersDetails = {
          name: actor.login || actor.name || '',
          id: actor.databaseId || 0,
          pullRequestNo: context.issue.number
        }
        if (!seenNames.has(user.name)) {
          seenNames.add(user.name)
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

function extractUserFromCommit(
  commit: GraphQLCommit
): GraphQLUser & GraphQLActor {
  return (commit.author?.user ||
    commit.committer?.user ||
    commit.author ||
    commit.committer ||
    {}) as GraphQLUser & GraphQLActor
}
