"use strict";
/**
 * Input and event env helpers. @actions/core reads inputs from
 * `INPUT_<NAME>` (uppercase, spaces -> underscores). @actions/github
 * reads repo/event from GITHUB_* env vars.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.setDefaultInputs = exports.resetEnv = exports.setGithubEnv = exports.setInput = void 0;
const trackedKeys = new Set();
function setInput(name, value) {
    const key = `INPUT_${name.replace(/ /g, '_').toUpperCase()}`;
    process.env[key] = value;
    trackedKeys.add(key);
}
exports.setInput = setInput;
function setGithubEnv(vars) {
    for (const [k, v] of Object.entries(vars)) {
        if (v === undefined) {
            delete process.env[k];
        }
        else {
            process.env[k] = v;
        }
        trackedKeys.add(k);
    }
}
exports.setGithubEnv = setGithubEnv;
function resetEnv() {
    for (const key of trackedKeys) {
        delete process.env[key];
    }
    trackedKeys.clear();
}
exports.resetEnv = resetEnv;
/** Set the full set of inputs the action typically receives. */
function setDefaultInputs(overrides = {}) {
    const defaults = {
        'path-to-signatures': 'signatures/v1/cla.json',
        'path-to-document': 'https://example.com/cla',
        branch: 'main',
        'allowlist': 'dependabot[bot],*[bot]',
        'remote-organization-name': '',
        'remote-repository-name': '',
        'create-file-commit-message': 'Creating file for storing CLA Signatures',
        'signed-commit-message': '$contributorName has signed the CLA',
        'use-dco-flag': 'false',
        'lock-pullrequest-aftermerge': 'true',
        'empty-commit-flag': 'false'
    };
    for (const [k, v] of Object.entries(Object.assign(Object.assign({}, defaults), overrides))) {
        if (v !== undefined)
            setInput(k, v);
    }
}
exports.setDefaultInputs = setDefaultInputs;
