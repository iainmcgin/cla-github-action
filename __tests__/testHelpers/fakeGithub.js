"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.installFakeGitHub = void 0;
const undici_1 = require("undici");
function sha(counter, prefix = 'sha') {
    return `${prefix}${counter.toString(16).padStart(8, '0')}`;
}
function installFakeGitHub() {
    const original = (0, undici_1.getGlobalDispatcher)();
    const agent = new undici_1.MockAgent();
    agent.disableNetConnect();
    (0, undici_1.setGlobalDispatcher)(agent);
    const repos = new Map();
    const recordedLocks = [];
    const recordedRerunRequests = [];
    let nextRepoId = 1000;
    function repoKey(owner, name) {
        return `${owner}/${name}`;
    }
    function getRepo(owner, name) {
        const key = repoKey(owner, name);
        let r = repos.get(key);
        if (!r) {
            r = {
                id: nextRepoId++,
                files: new Map(),
                comments: new Map(),
                pulls: new Map(),
                workflows: [],
                nextCommentId: 1,
                nextShaCounter: 1
            };
            repos.set(key, r);
        }
        return r;
    }
    const pool = agent.get('https://api.github.com');
    // Install a single persistent catch-all interceptor keyed by path regex.
    // undici's mock-agent lets reply be a function that receives the request.
    pool
        .intercept({ path: /.*/, method: 'GET' })
        .reply((opts) => routeGet(opts))
        .persist();
    pool
        .intercept({ path: /.*/, method: 'POST' })
        .reply((opts) => routePost(opts))
        .persist();
    pool
        .intercept({ path: /.*/, method: 'PUT' })
        .reply((opts) => routePut(opts))
        .persist();
    pool
        .intercept({ path: /.*/, method: 'PATCH' })
        .reply((opts) => routePatch(opts))
        .persist();
    pool
        .intercept({ path: /.*/, method: 'DELETE' })
        .reply(() => ({
        statusCode: 404,
        data: JSON.stringify({ message: 'not found' }),
        responseOptions: { headers: { 'content-type': 'application/json' } }
    }))
        .persist();
    function jsonResponse(statusCode, body) {
        return {
            statusCode,
            data: typeof body === 'string' ? body : JSON.stringify(body),
            responseOptions: { headers: { 'content-type': 'application/json' } }
        };
    }
    function notFound(msg = 'not found') {
        return jsonResponse(404, { message: msg });
    }
    function parsePath(rawPath) {
        const u = new URL(`https://api.github.com${rawPath}`);
        return { pathname: u.pathname, query: u.searchParams };
    }
    const getRoutes = [];
    const postRoutes = [];
    const putRoutes = [];
    const patchRoutes = [];
    function addRoute(list, pattern, handler) {
        // :param → (non-slash capture); :path param for contents is special (captures rest incl slashes, url-encoded)
        const re = new RegExp('^' + pattern.replace(/:([a-zA-Z]+)/g, (_, name) => {
            if (name === 'path')
                return '([^?]+)';
            return '([^/?]+)';
        }) + '$');
        list.push({ re, handler });
    }
    function dispatch(list, opts) {
        const { pathname, query } = parsePath(opts.path);
        for (const r of list) {
            const m = pathname.match(r.re);
            if (m)
                return r.handler(m, opts, query);
        }
        return jsonResponse(404, { message: `no fake route for ${opts.method} ${pathname}` });
    }
    // ---------- GET ----------
    addRoute(getRoutes, '/repos/:owner/:repo/contents/:path', (m, _opts, query) => {
        const owner = decodeURIComponent(m[1]);
        const name = decodeURIComponent(m[2]);
        const path = decodeURIComponent(m[3]);
        const repo = getRepo(owner, name);
        // Validate branch if provided (not strict; just echoed)
        void query.get('ref');
        const f = repo.files.get(path);
        if (!f)
            return notFound();
        return jsonResponse(200, { sha: f.sha, content: f.content, encoding: 'base64', path });
    });
    addRoute(getRoutes, '/repos/:owner/:repo/issues/:num/comments', (m) => {
        const owner = decodeURIComponent(m[1]);
        const name = decodeURIComponent(m[2]);
        const num = parseInt(m[3], 10);
        const repo = getRepo(owner, name);
        return jsonResponse(200, repo.comments.get(num) || []);
    });
    addRoute(getRoutes, '/repos/:owner/:repo/pulls/:num', (m) => {
        const owner = decodeURIComponent(m[1]);
        const name = decodeURIComponent(m[2]);
        const num = parseInt(m[3], 10);
        const pr = getRepo(owner, name).pulls.get(num);
        if (!pr)
            return notFound();
        return jsonResponse(200, { number: pr.number, head: pr.head, merged: !!pr.merged, state: pr.state || 'open' });
    });
    addRoute(getRoutes, '/repos/:owner/:repo/git/commits/:sha', (m) => {
        const s = decodeURIComponent(m[3]);
        return jsonResponse(200, { sha: s, tree: { sha: `tree-${s}` } });
    });
    addRoute(getRoutes, '/repos/:owner/:repo/git/trees/:sha', (m) => {
        const s = decodeURIComponent(m[3]);
        return jsonResponse(200, { sha: s, tree: [] });
    });
    addRoute(getRoutes, '/repos/:owner/:repo/actions/workflows', (m) => {
        const owner = decodeURIComponent(m[1]);
        const name = decodeURIComponent(m[2]);
        const repo = getRepo(owner, name);
        return jsonResponse(200, {
            total_count: repo.workflows.length,
            workflows: repo.workflows.map(w => ({ id: w.id, name: w.name }))
        });
    });
    addRoute(getRoutes, '/repos/:owner/:repo/actions/workflows/:id/runs', (m) => {
        const owner = decodeURIComponent(m[1]);
        const name = decodeURIComponent(m[2]);
        const id = parseInt(m[3], 10);
        const wf = getRepo(owner, name).workflows.find(w => w.id === id);
        if (!wf)
            return notFound();
        return jsonResponse(200, {
            total_count: wf.runs.length,
            workflow_runs: wf.runs.map(r => ({ id: r.id, conclusion: r.conclusion }))
        });
    });
    addRoute(getRoutes, '/repos/:owner/:repo/actions/runs/:id', (m) => {
        const owner = decodeURIComponent(m[1]);
        const name = decodeURIComponent(m[2]);
        const id = parseInt(m[3], 10);
        for (const wf of getRepo(owner, name).workflows) {
            const r = wf.runs.find(run => run.id === id);
            if (r)
                return jsonResponse(200, { id: r.id, conclusion: r.conclusion });
        }
        return notFound();
    });
    // ---------- PUT ----------
    addRoute(putRoutes, '/repos/:owner/:repo/contents/:path', (m, opts) => {
        const owner = decodeURIComponent(m[1]);
        const name = decodeURIComponent(m[2]);
        const path = decodeURIComponent(m[3]);
        const repo = getRepo(owner, name);
        const body = JSON.parse(opts.body || '{}');
        const newSha = sha(repo.nextShaCounter++, 'file');
        repo.files.set(path, { sha: newSha, content: body.content });
        return jsonResponse(200, { content: { sha: newSha, path }, commit: { sha: `commit-${newSha}` } });
    });
    addRoute(putRoutes, '/repos/:owner/:repo/issues/:num/lock', (m) => {
        const owner = decodeURIComponent(m[1]);
        const name = decodeURIComponent(m[2]);
        const num = parseInt(m[3], 10);
        recordedLocks.push({ owner, repo: name, issue: num });
        return jsonResponse(204, '');
    });
    // ---------- POST ----------
    addRoute(postRoutes, '/repos/:owner/:repo/issues/:num/comments', (m, opts) => {
        const owner = decodeURIComponent(m[1]);
        const name = decodeURIComponent(m[2]);
        const num = parseInt(m[3], 10);
        const body = JSON.parse(opts.body || '{}');
        const repo = getRepo(owner, name);
        const id = repo.nextCommentId++;
        const comment = {
            id,
            body: body.body,
            user: { login: 'github-actions[bot]', id: 41898282 },
            created_at: new Date().toISOString()
        };
        const list = repo.comments.get(num) || [];
        list.push(comment);
        repo.comments.set(num, list);
        return jsonResponse(201, comment);
    });
    addRoute(postRoutes, '/repos/:owner/:repo/git/commits', (m, opts) => {
        const owner = decodeURIComponent(m[1]);
        const name = decodeURIComponent(m[2]);
        const repo = getRepo(owner, name);
        const body = JSON.parse(opts.body || '{}');
        const newSha = sha(repo.nextShaCounter++, 'commit');
        return jsonResponse(201, { sha: newSha, tree: { sha: body.tree }, parents: (body.parents || []).map((p) => ({ sha: p })) });
    });
    addRoute(postRoutes, '/repos/:owner/:repo/actions/runs/:id/rerun', (m) => {
        const owner = decodeURIComponent(m[1]);
        const name = decodeURIComponent(m[2]);
        const id = parseInt(m[3], 10);
        recordedRerunRequests.push({ owner, repo: name, runId: id });
        return jsonResponse(201, '');
    });
    // ---------- PATCH ----------
    addRoute(patchRoutes, '/repos/:owner/:repo/issues/comments/:id', (m, opts) => {
        const owner = decodeURIComponent(m[1]);
        const name = decodeURIComponent(m[2]);
        const id = parseInt(m[3], 10);
        const body = JSON.parse(opts.body || '{}');
        const repo = getRepo(owner, name);
        for (const list of repo.comments.values()) {
            const c = list.find(c => c.id === id);
            if (c) {
                c.body = body.body;
                return jsonResponse(200, c);
            }
        }
        return notFound();
    });
    addRoute(patchRoutes, '/repos/:owner/:repo/git/refs/heads/:branch', (m) => {
        return jsonResponse(200, { ref: `refs/heads/${decodeURIComponent(m[3])}`, object: { sha: 'newref' } });
    });
    // ---------- GraphQL ----------
    function handleGraphQL(opts) {
        const body = JSON.parse(opts.body || '{}');
        const vars = body.variables || {};
        const repo = getRepo(vars.owner, vars.name);
        const pr = repo.pulls.get(vars.number);
        if (!pr)
            return jsonResponse(200, { data: { repository: { pullRequest: { commits: { totalCount: 0, edges: [], pageInfo: { endCursor: null, hasNextPage: false } } } } } });
        const edges = pr.commits.map(c => ({
            node: {
                commit: {
                    author: {
                        email: c.author.email || '',
                        name: c.author.name || c.author.login || '',
                        user: c.author.login
                            ? { id: `MDQ6VXNl${c.author.id}`, databaseId: c.author.id, login: c.author.login }
                            : null
                    },
                    committer: { name: c.author.name || c.author.login || '', user: null }
                }
            },
            cursor: 'c1'
        }));
        return jsonResponse(200, {
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
        });
    }
    function routeGet(opts) {
        return dispatch(getRoutes, opts);
    }
    function routePost(opts) {
        const { pathname } = parsePath(opts.path);
        if (pathname === '/graphql')
            return handleGraphQL(opts);
        return dispatch(postRoutes, opts);
    }
    function routePut(opts) {
        return dispatch(putRoutes, opts);
    }
    function routePatch(opts) {
        return dispatch(patchRoutes, opts);
    }
    function repoHandle(owner, name) {
        const repo = getRepo(owner, name);
        return {
            state: repo,
            setFile(p, contentJson) {
                const content = Buffer.from(typeof contentJson === 'string' ? contentJson : JSON.stringify(contentJson)).toString('base64');
                repo.files.set(p, { sha: sha(repo.nextShaCounter++, 'init'), content });
                return this;
            },
            getFile(p) {
                const f = repo.files.get(p);
                if (!f)
                    return undefined;
                return JSON.parse(Buffer.from(f.content, 'base64').toString());
            },
            addPullRequest(pr) {
                repo.pulls.set(pr.number, Object.assign({}, pr));
                return this;
            },
            addComment(issueNumber, c) {
                const id = repo.nextCommentId++;
                const comment = Object.assign({ id, created_at: new Date().toISOString() }, c);
                const list = repo.comments.get(issueNumber) || [];
                list.push(comment);
                repo.comments.set(issueNumber, list);
                return comment;
            },
            listComments(issueNumber) {
                return repo.comments.get(issueNumber) || [];
            },
            isLocked(issueNumber) {
                return recordedLocks.some(l => l.owner === owner && l.repo === name && l.issue === issueNumber);
            },
            addWorkflow(name_, runs = []) {
                const wf = { id: 10000 + repo.workflows.length, name: name_, runs };
                repo.workflows.push(wf);
                return wf;
            }
        };
    }
    return {
        repo: repoHandle,
        recordedLocks,
        recordedRerunRequests,
        close() {
            return __awaiter(this, void 0, void 0, function* () {
                yield agent.close();
                (0, undici_1.setGlobalDispatcher)(original);
            });
        }
    };
}
exports.installFakeGitHub = installFakeGitHub;
