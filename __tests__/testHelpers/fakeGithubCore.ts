/**
 * Transport-agnostic GitHub fake. Holds state + route handlers and exposes a
 * single `route(method, rawPath, body)` entrypoint. Wrappers adapt this to
 * undici MockAgent (in-process tests) or a real HTTP server (subprocess
 * smoke tests).
 */

export interface FileRecord {
  sha: string
  content: string // base64
}

export interface Comment {
  id: number
  body: string
  user: { login: string; id: number }
  created_at: string
}

export interface PullRequest {
  number: number
  head: { sha: string; ref: string }
  merged?: boolean
  state?: 'open' | 'closed'
  commits: Array<{
    author: { login?: string; name?: string; id?: number; email?: string }
  }>
}

export interface WorkflowRun {
  id: number
  conclusion: 'success' | 'failure' | null
}

export interface Workflow {
  id: number
  name: string
  runs: WorkflowRun[]
}

export interface RepoState {
  id: number
  files: Map<string, FileRecord>
  comments: Map<number, Comment[]>
  pulls: Map<number, PullRequest>
  workflows: Workflow[]
  nextCommentId: number
  nextShaCounter: number
}

export interface FakeRepoHandle {
  setFile(path: string, contentJson: unknown): FakeRepoHandle
  getFile(path: string): unknown | undefined
  addPullRequest(pr: PullRequest): FakeRepoHandle
  addComment(
    issueNumber: number,
    comment: Omit<Comment, 'id' | 'created_at'>
  ): Comment
  listComments(issueNumber: number): Comment[]
  isLocked(issueNumber: number): boolean
  addWorkflow(name: string, runs?: WorkflowRun[]): Workflow
  state: RepoState
}

export interface RouteResult {
  status: number
  body: string // serialized JSON (or empty string)
  headers?: Record<string, string> | undefined
}

export interface FaultInjection {
  method: string
  pathPattern: RegExp
  status: number
  body?: string
  headers?: Record<string, string>
  times: number
}

export interface FakeGitHubCore {
  repo(owner: string, name: string): FakeRepoHandle
  recordedLocks: Array<{ owner: string; repo: string; issue: number }>
  recordedRerunRequests: Array<{ owner: string; repo: string; runId: number }>
  /**
   * Make the next `spec.times` matching requests return the given status,
   * then fall through to normal routing. Useful for simulating transient
   * 5xx responses, 403 rate-limit, 502 gateway timeouts, etc.
   */
  injectFailure(spec: FaultInjection): void
  route(method: string, rawPath: string, body: string): RouteResult
}

function sha(counter: number, prefix = 'sha'): string {
  return `${prefix}${counter.toString(16).padStart(8, '0')}`
}

export function createFakeGitHubCore(): FakeGitHubCore {
  const repos = new Map<string, RepoState>()
  const recordedLocks: FakeGitHubCore['recordedLocks'] = []
  const recordedRerunRequests: FakeGitHubCore['recordedRerunRequests'] = []
  let nextRepoId = 1000
  const faults: FaultInjection[] = []

  function getRepo(owner: string, name: string): RepoState {
    const key = `${owner}/${name}`
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

  function json(status: number, body: unknown): RouteResult {
    return {
      status,
      body: typeof body === 'string' ? body : JSON.stringify(body)
    }
  }
  function notFound(msg = 'not found'): RouteResult {
    return json(404, { message: msg })
  }

  /**
   * Paginate a full list per the caller's page/per_page query parameters and
   * add a RFC 5988 Link header with rel="next" when more pages remain.
   * Mirrors GitHub's REST pagination contract that octokit.paginate follows.
   */
  function paginate<T>(
    all: T[],
    query: URLSearchParams,
    pathForLink: string
  ): RouteResult {
    const perPage = Math.max(
      1,
      Math.min(100, parseInt(query.get('per_page') || '30', 10))
    )
    const page = Math.max(1, parseInt(query.get('page') || '1', 10))
    const start = (page - 1) * perPage
    const slice = all.slice(start, start + perPage)
    const hasNext = start + perPage < all.length
    const headers: Record<string, string> = {}
    if (hasNext) {
      const nextUrl = `https://api.github.com${pathForLink}?page=${page + 1}&per_page=${perPage}`
      headers['link'] = `<${nextUrl}>; rel="next"`
    }
    return { status: 200, body: JSON.stringify(slice), headers }
  }

  type Handler = (
    match: RegExpMatchArray,
    body: string,
    query: URLSearchParams
  ) => RouteResult
  interface Route {
    re: RegExp
    handler: Handler
  }
  const getRoutes: Route[] = []
  const postRoutes: Route[] = []
  const putRoutes: Route[] = []
  const patchRoutes: Route[] = []

  function addRoute(list: Route[], pattern: string, handler: Handler) {
    const re = new RegExp(
      '^' +
        pattern.replace(/:([a-zA-Z]+)/g, (_, name) => {
          if (name === 'path') return '([^?]+)'
          return '([^/?]+)'
        }) +
        '$'
    )
    list.push({ re, handler })
  }

  function parsePath(raw: string): {
    pathname: string
    query: URLSearchParams
  } {
    const u = new URL(
      `https://api.github.com${raw.startsWith('/') ? raw : '/' + raw}`
    )
    return { pathname: u.pathname, query: u.searchParams }
  }

  function dispatch(
    list: Route[],
    method: string,
    rawPath: string,
    body: string
  ): RouteResult {
    const { pathname, query } = parsePath(rawPath)
    for (const r of list) {
      const m = pathname.match(r.re)
      if (m) return r.handler(m, body, query)
    }
    return json(404, { message: `no fake route for ${method} ${pathname}` })
  }

  // ---------- GET ----------
  addRoute(getRoutes, '/repos/:owner/:repo/contents/:path', (m, _b, query) => {
    const owner = decodeURIComponent(m[1]!)
    const name = decodeURIComponent(m[2]!)
    const path = decodeURIComponent(m[3]!)
    void query.get('ref')
    const f = getRepo(owner, name).files.get(path)
    if (!f) return notFound()
    return json(200, {
      sha: f.sha,
      content: f.content,
      encoding: 'base64',
      path
    })
  })
  addRoute(
    getRoutes,
    '/repos/:owner/:repo/issues/:num/comments',
    (m, _body, query) => {
      const owner = decodeURIComponent(m[1]!)
      const name = decodeURIComponent(m[2]!)
      const num = parseInt(m[3]!, 10)
      const all = getRepo(owner, name).comments.get(num) || []
      return paginate(
        all,
        query,
        `/repos/${owner}/${name}/issues/${num}/comments`
      )
    }
  )
  addRoute(getRoutes, '/repos/:owner/:repo/pulls/:num', m => {
    const owner = decodeURIComponent(m[1]!)
    const name = decodeURIComponent(m[2]!)
    const num = parseInt(m[3]!, 10)
    const pr = getRepo(owner, name).pulls.get(num)
    if (!pr) return notFound()
    return json(200, {
      number: pr.number,
      head: pr.head,
      merged: !!pr.merged,
      state: pr.state || 'open'
    })
  })
  addRoute(getRoutes, '/repos/:owner/:repo/git/commits/:sha', m => {
    const s = decodeURIComponent(m[3]!)
    return json(200, { sha: s, tree: { sha: `tree-${s}` } })
  })
  addRoute(getRoutes, '/repos/:owner/:repo/git/trees/:sha', m => {
    const s = decodeURIComponent(m[3]!)
    return json(200, { sha: s, tree: [] })
  })
  addRoute(getRoutes, '/repos/:owner/:repo/actions/workflows', m => {
    const owner = decodeURIComponent(m[1]!)
    const name = decodeURIComponent(m[2]!)
    const repo = getRepo(owner, name)
    return json(200, {
      total_count: repo.workflows.length,
      workflows: repo.workflows.map(w => ({ id: w.id, name: w.name }))
    })
  })
  addRoute(getRoutes, '/repos/:owner/:repo/actions/workflows/:id/runs', m => {
    const owner = decodeURIComponent(m[1]!)
    const name = decodeURIComponent(m[2]!)
    const id = parseInt(m[3]!, 10)
    const wf = getRepo(owner, name).workflows.find(w => w.id === id)
    if (!wf) return notFound()
    return json(200, {
      total_count: wf.runs.length,
      workflow_runs: wf.runs.map(r => ({ id: r.id, conclusion: r.conclusion }))
    })
  })
  addRoute(getRoutes, '/repos/:owner/:repo/actions/runs/:id', m => {
    const owner = decodeURIComponent(m[1]!)
    const name = decodeURIComponent(m[2]!)
    const id = parseInt(m[3]!, 10)
    for (const wf of getRepo(owner, name).workflows) {
      const r = wf.runs.find(run => run.id === id)
      if (r) return json(200, { id: r.id, conclusion: r.conclusion })
    }
    return notFound()
  })

  // ---------- PUT ----------
  addRoute(putRoutes, '/repos/:owner/:repo/contents/:path', (m, body) => {
    const owner = decodeURIComponent(m[1]!)
    const name = decodeURIComponent(m[2]!)
    const path = decodeURIComponent(m[3]!)
    const repo = getRepo(owner, name)
    const parsed = JSON.parse(body || '{}')
    const newSha = sha(repo.nextShaCounter++, 'file')
    repo.files.set(path, { sha: newSha, content: parsed.content })
    return json(200, {
      content: { sha: newSha, path },
      commit: { sha: `commit-${newSha}` }
    })
  })
  addRoute(putRoutes, '/repos/:owner/:repo/issues/:num/lock', m => {
    const owner = decodeURIComponent(m[1]!)
    const name = decodeURIComponent(m[2]!)
    const num = parseInt(m[3]!, 10)
    recordedLocks.push({ owner, repo: name, issue: num })
    return { status: 204, body: '' }
  })

  // ---------- POST ----------
  addRoute(
    postRoutes,
    '/repos/:owner/:repo/issues/:num/comments',
    (m, body) => {
      const owner = decodeURIComponent(m[1]!)
      const name = decodeURIComponent(m[2]!)
      const num = parseInt(m[3]!, 10)
      const parsed = JSON.parse(body || '{}')
      const repo = getRepo(owner, name)
      const id = repo.nextCommentId++
      const comment: Comment = {
        id,
        body: parsed.body,
        user: { login: 'github-actions[bot]', id: 41898282 },
        created_at: new Date().toISOString()
      }
      const list = repo.comments.get(num) || []
      list.push(comment)
      repo.comments.set(num, list)
      return json(201, comment)
    }
  )
  addRoute(postRoutes, '/repos/:owner/:repo/git/commits', (m, body) => {
    const owner = decodeURIComponent(m[1]!)
    const name = decodeURIComponent(m[2]!)
    const repo = getRepo(owner, name)
    const parsed = JSON.parse(body || '{}')
    const newSha = sha(repo.nextShaCounter++, 'commit')
    return json(201, {
      sha: newSha,
      tree: { sha: parsed.tree },
      parents: (parsed.parents || []).map((p: string) => ({ sha: p }))
    })
  })
  addRoute(postRoutes, '/repos/:owner/:repo/actions/runs/:id/rerun', m => {
    const owner = decodeURIComponent(m[1]!)
    const name = decodeURIComponent(m[2]!)
    const id = parseInt(m[3]!, 10)
    recordedRerunRequests.push({ owner, repo: name, runId: id })
    return { status: 201, body: '' }
  })

  // ---------- PATCH ----------
  addRoute(
    patchRoutes,
    '/repos/:owner/:repo/issues/comments/:id',
    (m, body) => {
      const owner = decodeURIComponent(m[1]!)
      const name = decodeURIComponent(m[2]!)
      const id = parseInt(m[3]!, 10)
      const parsed = JSON.parse(body || '{}')
      for (const list of getRepo(owner, name).comments.values()) {
        const c = list.find(c => c.id === id)
        if (c) {
          c.body = parsed.body
          return json(200, c)
        }
      }
      return notFound()
    }
  )
  addRoute(patchRoutes, '/repos/:owner/:repo/git/refs/heads/:branch', m => {
    return json(200, {
      ref: `refs/heads/${decodeURIComponent(m[3]!)}`,
      object: { sha: 'newref' }
    })
  })

  function handleGraphQL(body: string): RouteResult {
    const parsed = JSON.parse(body || '{}')
    const vars = parsed.variables || {}
    const repo = getRepo(vars.owner, vars.name)
    const pr = repo.pulls.get(vars.number)
    if (!pr)
      return json(200, {
        data: {
          repository: {
            pullRequest: {
              commits: {
                totalCount: 0,
                edges: [],
                pageInfo: { endCursor: null, hasNextPage: false }
              }
            }
          }
        }
      })
    const edges = pr.commits.map(c => ({
      node: {
        commit: {
          author: {
            email: c.author.email || '',
            name: c.author.name || c.author.login || '',
            user: c.author.login
              ? {
                  id: `MDQ6VXNl${c.author.id}`,
                  databaseId: c.author.id,
                  login: c.author.login
                }
              : null
          },
          committer: { name: c.author.name || c.author.login || '', user: null }
        }
      },
      cursor: 'c1'
    }))
    return json(200, {
      data: {
        repository: {
          pullRequest: {
            commits: {
              totalCount: edges.length,
              edges,
              pageInfo: { endCursor: 'c1', hasNextPage: false }
            }
          }
        }
      }
    })
  }

  function consumeFault(
    method: string,
    pathname: string
  ): RouteResult | undefined {
    // Match against both the raw and percent-decoded pathname so test regexes
    // can be written naturally ('/signatures/cla.json') and still match the
    // encoded URLs octokit emits ('/signatures%2Fcla.json').
    const decoded = decodeURIComponent(pathname)
    for (let i = 0; i < faults.length; i++) {
      const f = faults[i]!
      if (
        f.method.toUpperCase() !== method ||
        (!f.pathPattern.test(pathname) && !f.pathPattern.test(decoded))
      )
        continue
      f.times -= 1
      if (f.times <= 0) faults.splice(i, 1)
      return {
        status: f.status,
        body:
          f.body ?? JSON.stringify({ message: `fault-injected ${f.status}` }),
        headers: f.headers
      }
    }
    return undefined
  }

  function route(method: string, rawPath: string, body: string): RouteResult {
    const { pathname } = parsePath(rawPath)
    const m = method.toUpperCase()
    const fault = consumeFault(m, pathname)
    if (fault) return fault
    if (m === 'POST' && pathname === '/graphql') return handleGraphQL(body)
    switch (m) {
      case 'GET':
        return dispatch(getRoutes, m, rawPath, body)
      case 'POST':
        return dispatch(postRoutes, m, rawPath, body)
      case 'PUT':
        return dispatch(putRoutes, m, rawPath, body)
      case 'PATCH':
        return dispatch(patchRoutes, m, rawPath, body)
      case 'DELETE':
        return json(404, { message: 'not found' })
      default:
        return json(405, { message: `method ${m} not allowed` })
    }
  }

  function repoHandle(owner: string, name: string): FakeRepoHandle {
    const repo = getRepo(owner, name)
    return {
      state: repo,
      setFile(p, contentJson) {
        const content = Buffer.from(
          typeof contentJson === 'string'
            ? contentJson
            : JSON.stringify(contentJson)
        ).toString('base64')
        repo.files.set(p, { sha: sha(repo.nextShaCounter++, 'init'), content })
        return this
      },
      getFile(p) {
        const f = repo.files.get(p)
        if (!f) return undefined
        return JSON.parse(Buffer.from(f.content, 'base64').toString())
      },
      addPullRequest(pr) {
        repo.pulls.set(pr.number, { ...pr })
        return this
      },
      addComment(issueNumber, c) {
        const id = repo.nextCommentId++
        const comment: Comment = {
          id,
          created_at: new Date().toISOString(),
          ...c
        }
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
        const wf: Workflow = {
          id: 10000 + repo.workflows.length,
          name: name_,
          runs
        }
        repo.workflows.push(wf)
        return wf
      }
    }
  }

  function injectFailure(spec: FaultInjection): void {
    faults.push({ ...spec })
  }

  return {
    repo: repoHandle,
    recordedLocks,
    recordedRerunRequests,
    injectFailure,
    route
  }
}
