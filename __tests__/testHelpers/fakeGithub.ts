import {MockAgent, setGlobalDispatcher, getGlobalDispatcher, Dispatcher} from 'undici'

/**
 * Dynamic in-memory GitHub fake. Registers MockAgent interceptors that consult
 * and mutate a JS-side state object, so sequential action invocations (sign,
 * re-check, merge) can share realistic state without recorded fixtures.
 *
 * Supported surface (only what the action actually calls):
 * - GET    /repos/:o/:r/contents/:path[?ref=:branch]
 * - PUT    /repos/:o/:r/contents/:path          (create/update file)
 * - GET    /repos/:o/:r/issues/:n/comments
 * - POST   /repos/:o/:r/issues/:n/comments
 * - PATCH  /repos/:o/:r/issues/comments/:id
 * - PUT    /repos/:o/:r/issues/:n/lock
 * - GET    /repos/:o/:r/pulls/:n
 * - GET    /repos/:o/:r/git/commits/:sha
 * - GET    /repos/:o/:r/git/trees/:sha
 * - POST   /repos/:o/:r/git/commits
 * - PATCH  /repos/:o/:r/git/refs/heads/:branch
 * - GET    /repos/:o/:r/actions/workflows
 * - GET    /repos/:o/:r/actions/workflows/:id/runs
 * - GET    /repos/:o/:r/actions/runs/:id
 * - POST   /repos/:o/:r/actions/runs/:id/rerun
 * - POST   /graphql          (PR commits query used by src/graphql.ts)
 */

interface FileRecord {
  sha: string
  content: string  // base64 encoded
}

interface Comment {
  id: number
  body: string
  user: {login: string; id: number}
  created_at: string
}

interface PullRequest {
  number: number
  head: {sha: string; ref: string}
  merged?: boolean
  state?: 'open' | 'closed'
  commits: Array<{
    author: {login?: string; name?: string; id?: number; email?: string}
  }>
}

interface WorkflowRun {
  id: number
  conclusion: 'success' | 'failure' | null
}

interface Workflow {
  id: number
  name: string
  runs: WorkflowRun[]
}

interface RepoState {
  id: number
  files: Map<string, FileRecord>
  comments: Map<number, Comment[]>  // issue number -> comments
  pulls: Map<number, PullRequest>
  workflows: Workflow[]
  nextCommentId: number
  nextShaCounter: number
}

export interface FakeRepoHandle {
  setFile(path: string, contentJson: unknown): FakeRepoHandle
  getFile(path: string): unknown | undefined
  addPullRequest(pr: PullRequest): FakeRepoHandle
  addComment(issueNumber: number, comment: Omit<Comment, 'id' | 'created_at'>): Comment
  listComments(issueNumber: number): Comment[]
  isLocked(issueNumber: number): boolean
  addWorkflow(name: string, runs?: WorkflowRun[]): Workflow
  state: RepoState
}

export interface FakeGitHub {
  repo(owner: string, name: string): FakeRepoHandle
  recordedLocks: Array<{owner: string; repo: string; issue: number}>
  recordedRerunRequests: Array<{owner: string; repo: string; runId: number}>
  close(): Promise<void>
}

function sha(counter: number, prefix = 'sha'): string {
  return `${prefix}${counter.toString(16).padStart(8, '0')}`
}

export function installFakeGitHub(): FakeGitHub {
  const original = getGlobalDispatcher()
  const agent = new MockAgent()
  agent.disableNetConnect()
  setGlobalDispatcher(agent)

  const repos = new Map<string, RepoState>()
  const recordedLocks: Array<{owner: string; repo: string; issue: number}> = []
  const recordedRerunRequests: Array<{owner: string; repo: string; runId: number}> = []
  let nextRepoId = 1000

  function repoKey(owner: string, name: string): string {
    return `${owner}/${name}`
  }

  function getRepo(owner: string, name: string): RepoState {
    const key = repoKey(owner, name)
    let r = repos.get(key)
    if (!r) {
      r = {
        id: nextRepoId++,
        files: new Map(),
        comments: new Map(),
        pulls: new Map(),
        workflows: [],
        nextCommentId: 1,
        nextShaCounter: 1
      }
      repos.set(key, r)
    }
    return r
  }

  const pool = agent.get('https://api.github.com')

  // Install a single persistent catch-all interceptor keyed by path regex.
  // undici's mock-agent lets reply be a function that receives the request.
  pool
    .intercept({path: /.*/, method: 'GET'})
    .reply((opts: any) => routeGet(opts))
    .persist()
  pool
    .intercept({path: /.*/, method: 'POST'})
    .reply((opts: any) => routePost(opts))
    .persist()
  pool
    .intercept({path: /.*/, method: 'PUT'})
    .reply((opts: any) => routePut(opts))
    .persist()
  pool
    .intercept({path: /.*/, method: 'PATCH'})
    .reply((opts: any) => routePatch(opts))
    .persist()
  pool
    .intercept({path: /.*/, method: 'DELETE'})
    .reply(() => ({
      statusCode: 404,
      data: JSON.stringify({message: 'not found'}),
      responseOptions: {headers: {'content-type': 'application/json'}}
    }))
    .persist()

  function jsonResponse(statusCode: number, body: unknown) {
    return {
      statusCode,
      data: typeof body === 'string' ? body : JSON.stringify(body),
      responseOptions: {headers: {'content-type': 'application/json'}}
    }
  }
  function notFound(msg = 'not found') {
    return jsonResponse(404, {message: msg})
  }

  function parsePath(rawPath: string): {pathname: string; query: URLSearchParams} {
    const u = new URL(`https://api.github.com${rawPath}`)
    return {pathname: u.pathname, query: u.searchParams}
  }

  type Handler = (match: RegExpMatchArray, opts: any, query: URLSearchParams) => ReturnType<typeof jsonResponse>
  interface Route {re: RegExp; handler: Handler}

  const getRoutes: Route[] = []
  const postRoutes: Route[] = []
  const putRoutes: Route[] = []
  const patchRoutes: Route[] = []

  function addRoute(list: Route[], pattern: string, handler: Handler) {
    // :param → (non-slash capture); :path param for contents is special (captures rest incl slashes, url-encoded)
    const re = new RegExp(
      '^' + pattern.replace(/:([a-zA-Z]+)/g, (_, name) => {
        if (name === 'path') return '([^?]+)'
        return '([^/?]+)'
      }) + '$'
    )
    list.push({re, handler})
  }

  function dispatch(list: Route[], opts: any) {
    const {pathname, query} = parsePath(opts.path)
    for (const r of list) {
      const m = pathname.match(r.re)
      if (m) return r.handler(m, opts, query)
    }
    return jsonResponse(404, {message: `no fake route for ${opts.method} ${pathname}`})
  }

  // ---------- GET ----------
  addRoute(getRoutes, '/repos/:owner/:repo/contents/:path', (m, _opts, query) => {
    const owner = decodeURIComponent(m[1])
    const name = decodeURIComponent(m[2])
    const path = decodeURIComponent(m[3])
    const repo = getRepo(owner, name)
    // Validate branch if provided (not strict; just echoed)
    void query.get('ref')
    const f = repo.files.get(path)
    if (!f) return notFound()
    return jsonResponse(200, {sha: f.sha, content: f.content, encoding: 'base64', path})
  })
  addRoute(getRoutes, '/repos/:owner/:repo/issues/:num/comments', (m) => {
    const owner = decodeURIComponent(m[1])
    const name = decodeURIComponent(m[2])
    const num = parseInt(m[3], 10)
    const repo = getRepo(owner, name)
    return jsonResponse(200, repo.comments.get(num) || [])
  })
  addRoute(getRoutes, '/repos/:owner/:repo/pulls/:num', (m) => {
    const owner = decodeURIComponent(m[1])
    const name = decodeURIComponent(m[2])
    const num = parseInt(m[3], 10)
    const pr = getRepo(owner, name).pulls.get(num)
    if (!pr) return notFound()
    return jsonResponse(200, {number: pr.number, head: pr.head, merged: !!pr.merged, state: pr.state || 'open'})
  })
  addRoute(getRoutes, '/repos/:owner/:repo/git/commits/:sha', (m) => {
    const s = decodeURIComponent(m[3])
    return jsonResponse(200, {sha: s, tree: {sha: `tree-${s}`}})
  })
  addRoute(getRoutes, '/repos/:owner/:repo/git/trees/:sha', (m) => {
    const s = decodeURIComponent(m[3])
    return jsonResponse(200, {sha: s, tree: []})
  })
  addRoute(getRoutes, '/repos/:owner/:repo/actions/workflows', (m) => {
    const owner = decodeURIComponent(m[1])
    const name = decodeURIComponent(m[2])
    const repo = getRepo(owner, name)
    return jsonResponse(200, {
      total_count: repo.workflows.length,
      workflows: repo.workflows.map(w => ({id: w.id, name: w.name}))
    })
  })
  addRoute(getRoutes, '/repos/:owner/:repo/actions/workflows/:id/runs', (m) => {
    const owner = decodeURIComponent(m[1])
    const name = decodeURIComponent(m[2])
    const id = parseInt(m[3], 10)
    const wf = getRepo(owner, name).workflows.find(w => w.id === id)
    if (!wf) return notFound()
    return jsonResponse(200, {
      total_count: wf.runs.length,
      workflow_runs: wf.runs.map(r => ({id: r.id, conclusion: r.conclusion}))
    })
  })
  addRoute(getRoutes, '/repos/:owner/:repo/actions/runs/:id', (m) => {
    const owner = decodeURIComponent(m[1])
    const name = decodeURIComponent(m[2])
    const id = parseInt(m[3], 10)
    for (const wf of getRepo(owner, name).workflows) {
      const r = wf.runs.find(run => run.id === id)
      if (r) return jsonResponse(200, {id: r.id, conclusion: r.conclusion})
    }
    return notFound()
  })

  // ---------- PUT ----------
  addRoute(putRoutes, '/repos/:owner/:repo/contents/:path', (m, opts) => {
    const owner = decodeURIComponent(m[1])
    const name = decodeURIComponent(m[2])
    const path = decodeURIComponent(m[3])
    const repo = getRepo(owner, name)
    const body = JSON.parse((opts.body as string) || '{}')
    const newSha = sha(repo.nextShaCounter++, 'file')
    repo.files.set(path, {sha: newSha, content: body.content})
    return jsonResponse(200, {content: {sha: newSha, path}, commit: {sha: `commit-${newSha}`}})
  })
  addRoute(putRoutes, '/repos/:owner/:repo/issues/:num/lock', (m) => {
    const owner = decodeURIComponent(m[1])
    const name = decodeURIComponent(m[2])
    const num = parseInt(m[3], 10)
    recordedLocks.push({owner, repo: name, issue: num})
    return jsonResponse(204, '')
  })

  // ---------- POST ----------
  addRoute(postRoutes, '/repos/:owner/:repo/issues/:num/comments', (m, opts) => {
    const owner = decodeURIComponent(m[1])
    const name = decodeURIComponent(m[2])
    const num = parseInt(m[3], 10)
    const body = JSON.parse((opts.body as string) || '{}')
    const repo = getRepo(owner, name)
    const id = repo.nextCommentId++
    const comment: Comment = {
      id,
      body: body.body,
      user: {login: 'github-actions[bot]', id: 41898282},
      created_at: new Date().toISOString()
    }
    const list = repo.comments.get(num) || []
    list.push(comment)
    repo.comments.set(num, list)
    return jsonResponse(201, comment)
  })
  addRoute(postRoutes, '/repos/:owner/:repo/git/commits', (m, opts) => {
    const owner = decodeURIComponent(m[1])
    const name = decodeURIComponent(m[2])
    const repo = getRepo(owner, name)
    const body = JSON.parse((opts.body as string) || '{}')
    const newSha = sha(repo.nextShaCounter++, 'commit')
    return jsonResponse(201, {sha: newSha, tree: {sha: body.tree}, parents: (body.parents || []).map((p: string) => ({sha: p}))})
  })
  addRoute(postRoutes, '/repos/:owner/:repo/actions/runs/:id/rerun', (m) => {
    const owner = decodeURIComponent(m[1])
    const name = decodeURIComponent(m[2])
    const id = parseInt(m[3], 10)
    recordedRerunRequests.push({owner, repo: name, runId: id})
    return jsonResponse(201, '')
  })

  // ---------- PATCH ----------
  addRoute(patchRoutes, '/repos/:owner/:repo/issues/comments/:id', (m, opts) => {
    const owner = decodeURIComponent(m[1])
    const name = decodeURIComponent(m[2])
    const id = parseInt(m[3], 10)
    const body = JSON.parse((opts.body as string) || '{}')
    const repo = getRepo(owner, name)
    for (const list of repo.comments.values()) {
      const c = list.find(c => c.id === id)
      if (c) {
        c.body = body.body
        return jsonResponse(200, c)
      }
    }
    return notFound()
  })
  addRoute(patchRoutes, '/repos/:owner/:repo/git/refs/heads/:branch', (m) => {
    return jsonResponse(200, {ref: `refs/heads/${decodeURIComponent(m[3])}`, object: {sha: 'newref'}})
  })

  // ---------- GraphQL ----------
  function handleGraphQL(opts: any) {
    const body = JSON.parse((opts.body as string) || '{}')
    const vars = body.variables || {}
    const repo = getRepo(vars.owner, vars.name)
    const pr = repo.pulls.get(vars.number)
    if (!pr) return jsonResponse(200, {data: {repository: {pullRequest: {commits: {totalCount: 0, edges: [], pageInfo: {endCursor: null, hasNextPage: false}}}}}})
    const edges = pr.commits.map(c => ({
      node: {
        commit: {
          author: {
            email: c.author.email || '',
            name: c.author.name || c.author.login || '',
            user: c.author.login
              ? {id: `MDQ6VXNl${c.author.id}`, databaseId: c.author.id, login: c.author.login}
              : null
          },
          committer: {name: c.author.name || c.author.login || '', user: null}
        }
      },
      cursor: 'c1'
    }))
    return jsonResponse(200, {
      data: {
        repository: {
          pullRequest: {
            commits: {
              totalCount: edges.length,
              edges,
              pageInfo: {endCursor: 'c1', hasNextPage: false}
            }
          }
        }
      }
    })
  }

  function routeGet(opts: any) {
    return dispatch(getRoutes, opts)
  }
  function routePost(opts: any) {
    const {pathname} = parsePath(opts.path)
    if (pathname === '/graphql') return handleGraphQL(opts)
    return dispatch(postRoutes, opts)
  }
  function routePut(opts: any) {
    return dispatch(putRoutes, opts)
  }
  function routePatch(opts: any) {
    return dispatch(patchRoutes, opts)
  }

  function repoHandle(owner: string, name: string): FakeRepoHandle {
    const repo = getRepo(owner, name)
    return {
      state: repo,
      setFile(p, contentJson) {
        const content = Buffer.from(
          typeof contentJson === 'string' ? contentJson : JSON.stringify(contentJson)
        ).toString('base64')
        repo.files.set(p, {sha: sha(repo.nextShaCounter++, 'init'), content})
        return this
      },
      getFile(p) {
        const f = repo.files.get(p)
        if (!f) return undefined
        return JSON.parse(Buffer.from(f.content, 'base64').toString())
      },
      addPullRequest(pr) {
        repo.pulls.set(pr.number, {...pr})
        return this
      },
      addComment(issueNumber, c) {
        const id = repo.nextCommentId++
        const comment: Comment = {id, created_at: new Date().toISOString(), ...c}
        const list = repo.comments.get(issueNumber) || []
        list.push(comment)
        repo.comments.set(issueNumber, list)
        return comment
      },
      listComments(issueNumber) {
        return repo.comments.get(issueNumber) || []
      },
      isLocked(issueNumber) {
        return recordedLocks.some(
          l => l.owner === owner && l.repo === name && l.issue === issueNumber
        )
      },
      addWorkflow(name_, runs = []) {
        const wf: Workflow = {id: 10000 + repo.workflows.length, name: name_, runs}
        repo.workflows.push(wf)
        return wf
      }
    }
  }

  return {
    repo: repoHandle,
    recordedLocks,
    recordedRerunRequests,
    async close() {
      await agent.close()
      setGlobalDispatcher(original)
    }
  } satisfies FakeGitHub
}
