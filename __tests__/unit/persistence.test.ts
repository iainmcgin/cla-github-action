import {
  captureJson,
  installMockAgent,
  MockAgentHarness
} from '../testHelpers/mockAgent'
import { resetEnv, setDefaultInputs, setInput } from '../testHelpers/env'
import { reloadOctokit, setContext } from '../testHelpers/context'

const persistencePath = require.resolve('../../src/persistence/persistence')

function loadPersistence() {
  reloadOctokit()
  delete require.cache[persistencePath]
  return require('../../src/persistence/persistence') as typeof import('../../src/persistence/persistence')
}

describe('persistence', () => {
  let http: MockAgentHarness

  beforeEach(() => {
    setDefaultInputs({ branch: 'main' })
    http = installMockAgent()
    setContext()
  })

  afterEach(async () => {
    await http.close()
    resetEnv()
  })

  describe('getFileContent', () => {
    it('GETs the signatures file from the current repo', async () => {
      http
        .github()
        .intercept({
          path: '/repos/acme/widgets/contents/signatures%2Fv1%2Fcla.json?ref=main',
          method: 'GET'
        })
        .reply(
          200,
          {
            sha: 'deadbeef',
            content: Buffer.from('{}').toString('base64'),
            encoding: 'base64'
          },
          { headers: { 'content-type': 'application/json' } }
        )

      const { getFileContent } = loadPersistence()
      const res = await getFileContent()
      expect(res.data.sha).toBe('deadbeef')
      http.assertClean()
    })

    it('routes to the remote org/repo when configured', async () => {
      setInput('remote-organization-name', 'other-org')
      setInput('remote-repository-name', 'other-repo')
      http
        .github()
        .intercept({
          path: '/repos/other-org/other-repo/contents/signatures%2Fv1%2Fcla.json?ref=main',
          method: 'GET'
        })
        .reply(
          200,
          { sha: 'abc', content: Buffer.from('{}').toString('base64') },
          { headers: { 'content-type': 'application/json' } }
        )

      const { getFileContent } = loadPersistence()
      await getFileContent()
      http.assertClean()
    })
  })

  describe('createFile', () => {
    it('PUTs a new signatures file with the create-file commit message', async () => {
      const captured = captureJson(
        http.github(),
        {
          path: '/repos/acme/widgets/contents/signatures%2Fv1%2Fcla.json',
          method: 'PUT'
        },
        { status: 201, body: { content: { sha: 'created' } } }
      )

      const { createFile } = loadPersistence()
      const b64 = Buffer.from('{}').toString('base64')
      await createFile(b64)

      expect(captured.body.content).toBe(b64)
      expect(captured.body.message).toBe(
        'Creating file for storing CLA Signatures'
      )
      expect(captured.body.branch).toBe('main')
      http.assertClean()
    })

    it('uses the user-supplied create-file commit message when set', async () => {
      setInput('create-file-commit-message', 'chore: init cla store')
      const captured = captureJson(
        http.github(),
        {
          path: '/repos/acme/widgets/contents/signatures%2Fv1%2Fcla.json',
          method: 'PUT'
        },
        { status: 201, body: { content: { sha: 'x' } } }
      )

      const { createFile } = loadPersistence()
      await createFile(Buffer.from('{}').toString('base64'))
      expect(captured.body.message).toBe('chore: init cla store')
    })
  })

  describe('updateFile', () => {
    it('PUTs the updated signatures file, appending newSigned contributors', async () => {
      const captured = captureJson(
        http.github(),
        {
          path: '/repos/acme/widgets/contents/signatures%2Fv1%2Fcla.json',
          method: 'PUT'
        },
        { status: 200, body: { content: { sha: 'new' } } }
      )

      const { updateFile } = loadPersistence()
      const claContent = { signedContributors: [{ name: 'alice', id: 1 }] }
      await updateFile('oldsha', claContent, {
        newSigned: [{ name: 'bob', id: 2 }],
        allSignedFlag: false,
        signed: [],
        notSigned: [],
        unknown: []
      } as any)

      expect(captured.body.sha).toBe('oldsha')
      const decoded = JSON.parse(
        Buffer.from(captured.body.content, 'base64').toString()
      )
      expect(decoded.signedContributors.map((c: any) => c.name)).toEqual([
        'alice',
        'bob'
      ])
      expect(captured.body.message).toContain('alice has signed the CLA')
    })

    it('substitutes $contributorName/$pullRequestNo/$owner/$repo in the commit message template', async () => {
      setInput(
        'signed-commit-message',
        '$contributorName signed CLA on $owner/$repo#$pullRequestNo'
      )
      const captured = captureJson(
        http.github(),
        {
          path: '/repos/acme/widgets/contents/signatures%2Fv1%2Fcla.json',
          method: 'PUT'
        },
        { status: 200, body: { content: { sha: 'new' } } }
      )

      const { updateFile } = loadPersistence()
      await updateFile('oldsha', { signedContributors: [] }, {
        newSigned: [],
        allSignedFlag: false,
        signed: [],
        notSigned: [],
        unknown: []
      } as any)

      expect(captured.body.message).toBe('alice signed CLA on acme/widgets#42')
    })
  })
})
