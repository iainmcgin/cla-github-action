/**
 * A committer of a pull request, derived from the GitHub GraphQL API.
 * The minimal identity used for allow-list checks and signature lookup.
 */
export interface Committer {
  name: string
  id: number
  pullRequestNo?: number | undefined
  /**
   * Commit-author email. Present only when the GraphQL lookup could not map
   * the commit to a GitHub user (i.e. when this committer ends up in
   * CommitterMap.unknown). Surfaced to the contributor in the PR comment so
   * they know which specific email address to link or rewrite.
   */
  email?: string | undefined
}

/**
 * A PR comment that matches the configured "sign phrase". Carries the
 * commenter identity (same shape as Committer) plus the comment metadata
 * needed to persist it. Field types line up with Signature so a
 * SigningComment is directly assignable to Signature.
 */
export interface SigningComment extends Committer {
  comment_id?: number | undefined
  body?: string | undefined
  created_at?: string | undefined
  repoId?: number | undefined
}

export interface CommitterMap {
  signed: Committer[]
  notSigned: Committer[]
  unknown: Committer[]
}

export interface ReactedCommitterMap {
  newSigned: SigningComment[]
  onlyCommitters?: Committer[] | undefined
  allSignedFlag: boolean
}

/** Shape of a single record in the signatures JSON file. */
export interface Signature {
  name: string
  id: number
  comment_id?: number | undefined
  created_at?: string | undefined
  repoId?: number | undefined
  pullRequestNo?: number | undefined
}

/** Shape of the signatures JSON file on disk. */
export interface ClaFileContent {
  signedContributors: Signature[]
}

export interface ClafileContentAndSha {
  claFileContent: ClaFileContent
  sha: string
}
