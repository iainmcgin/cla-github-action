"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.reloadOctokit = exports.setContext = void 0;
const github = __importStar(require("@actions/github"));
const defaults = {
    owner: 'acme',
    repo: 'widgets',
    issueNumber: 42,
    actor: 'alice',
    eventName: 'pull_request_target',
    workflow: 'cla-check',
    payload: {}
};
/** Overwrite the @actions/github context with test values. */
function setContext(overrides = {}) {
    const ctx = Object.assign(Object.assign({}, defaults), overrides);
    // @ts-ignore — overwrite the readonly Context instance for test setup
    github.context = {
        repo: { owner: ctx.owner, repo: ctx.repo },
        issue: { owner: ctx.owner, repo: ctx.repo, number: ctx.issueNumber },
        actor: ctx.actor,
        eventName: ctx.eventName,
        workflow: ctx.workflow,
        payload: ctx.payload
    };
    return ctx;
}
exports.setContext = setContext;
/** Drop the module cache for src/octokit.ts so a test-owned GITHUB_TOKEN is picked up. */
function reloadOctokit() {
    const p = require.resolve('../../src/octokit');
    delete require.cache[p];
}
exports.reloadOctokit = reloadOctokit;
