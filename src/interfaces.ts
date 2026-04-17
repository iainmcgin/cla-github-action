export interface CommitterMap {
  signed: CommittersDetails[]
  notSigned: CommittersDetails[]
  unknown: CommittersDetails[]
}

export interface ReactedCommitterMap {
  newSigned: CommittersDetails[]
  onlyCommitters?: CommittersDetails[]
  allSignedFlag: boolean
}

export interface CommittersDetails {
  name: string
  id: number
  pullRequestNo?: number | undefined
  created_at?: string | undefined
  updated_at?: string | undefined
  comment_id?: number | undefined
  body?: string | undefined
  repoId?: number | undefined
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
