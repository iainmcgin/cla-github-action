export interface CommitterMap {
    signed: CommittersDetails[],
    notSigned: CommittersDetails[],
    unknown: CommittersDetails[]
}

export interface ReactedCommitterMap {
    newSigned: CommittersDetails[],
    onlyCommitters?: CommittersDetails[],
    allSignedFlag: boolean
}

export interface CommittersDetails {
    name: string,
    id: number,
    pullRequestNo?: number,
    created_at?: string,
    updated_at?: string,
    comment_id?: number,
    body?: string,
    repoId?: number
}

/** Shape of a single record in the signatures JSON file. */
export interface Signature {
    name: string
    id: number
    comment_id?: number
    created_at?: string
    repoId?: number
    pullRequestNo?: number
}

/** Shape of the signatures JSON file on disk. */
export interface ClaFileContent {
    signedContributors: Signature[]
}

export interface ClafileContentAndSha {
    claFileContent: ClaFileContent
    sha: string
}
