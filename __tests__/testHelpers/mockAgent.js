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
exports.captureJson = exports.useMockAgent = exports.installMockAgent = void 0;
const undici_1 = require("undici");
function installMockAgent() {
    const original = (0, undici_1.getGlobalDispatcher)();
    const agent = new undici_1.MockAgent();
    agent.disableNetConnect();
    (0, undici_1.setGlobalDispatcher)(agent);
    return {
        agent,
        github: () => agent.get('https://api.github.com'),
        assertClean: () => agent.assertNoPendingInterceptors(),
        close: () => __awaiter(this, void 0, void 0, function* () {
            yield agent.close();
            (0, undici_1.setGlobalDispatcher)(original);
        })
    };
}
exports.installMockAgent = installMockAgent;
/** Jest-style beforeEach/afterEach setup. Returns a getter. */
function useMockAgent() {
    let harness;
    beforeEach(() => {
        harness = installMockAgent();
    });
    afterEach(() => __awaiter(this, void 0, void 0, function* () {
        yield harness.close();
        harness = undefined;
    }));
    return () => harness;
}
exports.useMockAgent = useMockAgent;
/**
 * Install an interceptor that captures the request body as JSON and returns
 * the given reply. The returned object's `body` is populated after the request
 * is made.
 */
function captureJson(pool, match, reply) {
    const captured = {
        body: undefined,
        rawBody: undefined
    };
    pool
        .intercept(match)
        .reply(reply.status, (opts) => {
        const raw = typeof opts.body === 'string' ? opts.body : '';
        captured.rawBody = raw;
        try {
            captured.body = raw ? JSON.parse(raw) : undefined;
        }
        catch (_a) {
            captured.body = undefined;
        }
        return reply.body;
    }, { headers: { 'content-type': 'application/json' } });
    return captured;
}
exports.captureJson = captureJson;
