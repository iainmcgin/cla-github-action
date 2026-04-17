import { octokit } from './octokit'
import { context } from '@actions/github'
import { CommittersDetails } from './interfaces'

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
    node: {commit: GraphQLCommit}
    cursor: string
}



export default async function getCommitters(): Promise<CommittersDetails[]> {
    try {
        let committers: CommittersDetails[] = []
        let filteredCommitters: CommittersDetails[] = []
        let response: any = await octokit.graphql(`
        query($owner:String! $name:String! $number:Int! $cursor:String!){
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
                                    user {
                                        id
                                        databaseId
                                        login
                                    }
                                }
                                committer {
                                    name
                                    user {
                                        id
                                        databaseId
                                        login
                                    }
                                }
                            }
                        }
                        cursor
                    }
                    pageInfo {
                        endCursor
                        hasNextPage
                    }
                }
            }
        }
    }`, {
            owner: context.repo.owner,
            name: context.repo.repo,
            number: context.issue.number,
            cursor: ''
        })
        response.repository.pullRequest.commits.edges.forEach((edge: GraphQLEdge) => {
            const committer = extractUserFromCommit(edge.node.commit)
            let user: CommittersDetails = {
                name: committer.login || committer.name || '',
                id: committer.databaseId || 0,
                pullRequestNo: context.issue.number
            }
            if (committers.length === 0 || committers.map((c) => {
                return c.name
            }).indexOf(user.name) < 0) {
                committers.push(user)
            }
        })
        filteredCommitters = committers.filter((committer) => {
            return committer.id !== 41898282
        })
        return filteredCommitters

    } catch (e) {
        throw new Error(`graphql call to get the committers details failed: ${e}`)
    }

}
function extractUserFromCommit(commit: GraphQLCommit): GraphQLUser & GraphQLActor {
    return (commit.author?.user || commit.committer?.user || commit.author || commit.committer || {}) as GraphQLUser & GraphQLActor
}