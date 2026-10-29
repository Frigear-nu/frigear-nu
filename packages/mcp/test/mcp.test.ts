import { fileURLToPath } from 'node:url'
import { rm } from 'node:fs/promises'
import { afterAll, describe, expect, it } from 'vitest'
import { fetch, setup } from '@nuxt/test-utils/e2e'
import { authApi } from '@frigear-nu/auth/utils'

const fixture = fileURLToPath(new URL('./fixtures/mcp-db', import.meta.url))
const dataDir = `${fixture}/.data`

interface Auth { cookie?: string, bearer?: string }

function headers(auth: Auth) {
  return {
    'content-type': 'application/json',
    'accept': 'application/json, text/event-stream',
    ...(auth.cookie ? { cookie: auth.cookie } : {}),
    ...(auth.bearer ? { authorization: `Bearer ${auth.bearer}` } : {}),
  }
}

async function rpc(auth: Auth, method: string, params: Record<string, unknown> = {}) {
  const response = await fetch('/mcp', {
    method: 'POST',
    headers: headers(auth),
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  })
  const text = await response.text()
  // Streamable HTTP answers either as JSON or as a single SSE `data:` frame.
  const payload = text.trimStart().startsWith('{') ? text : text.split('\n').find(line => line.startsWith('data:'))?.slice(5) ?? '{}'
  return { status: response.status, body: JSON.parse(payload) as { result?: { tools?: Array<{ name: string }> } & Record<string, unknown>, error?: unknown } }
}

async function toolNames(auth: Auth) {
  const { body } = await rpc(auth, 'tools/list')
  return (body.result?.tools ?? []).map((tool: { name: string }) => tool.name).sort() as string[]
}

async function login(id: number) {
  const response = await fetch('/api/test/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id }) })
  expect(response.status, await response.clone().text()).toBe(200)
  return response.headers.get('set-cookie')!.split(';')[0]!
}

async function createToken(cookie: string, scopes: string[]) {
  const response = await fetch(authApi.me.tokens, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({ name: 'MCP', scopes }),
  })
  expect(response.status, await response.clone().text()).toBe(201)
  return (await response.json() as { token: string }).token
}

describe('scoped MCP tools', async () => {
  await rm(dataDir, { recursive: true, force: true })
  afterAll(() => rm(dataDir, { recursive: true, force: true }))

  await setup({ rootDir: fixture, dev: true, serverStartTimeout: 180_000, setupTimeout: 240_000 })

  let ada: string
  let staff: string

  it('lists nothing to anonymous callers and never exposes unscoped definitions', async () => {
    ada = await login(1)
    staff = await login(3)
    expect(await toolNames({})).toEqual([])
    expect(await toolNames({ cookie: ada })).not.toContain('unscoped')
  })

  it('only lists tools within the token scopes', async () => {
    const readToken = await createToken(ada, ['notes:read'])
    expect(await toolNames({ bearer: readToken })).toEqual(['my-notes'])

    const noScopes = await createToken(ada, ['notes:pii'])
    expect(await toolNames({ bearer: noScopes })).toEqual([])
  })

  it('hides manager tools unless the host policy allows the caller, even with the scope', async () => {
    const adaManage = await createToken(ada, ['notes:read', 'notes:manage'])
    expect(await toolNames({ bearer: adaManage })).toEqual(['my-notes'])

    const staffManage = await createToken(staff, ['notes:read', 'notes:manage'])
    expect(await toolNames({ bearer: staffManage })).toEqual(['list-notes', 'my-notes'])
  })

  it('rejects a direct call to a tool the caller cannot see', async () => {
    const adaManage = await createToken(ada, ['notes:read', 'notes:manage'])
    const { body } = await rpc({ bearer: adaManage }, 'tools/call', { name: 'list-notes', arguments: {} })
    expect(body.error ?? body.result?.isError).toBeTruthy()
    expect(JSON.stringify(body)).not.toContain('ada@example.test')
  })

  it('keeps "my" tools to the caller and redacts PII unless notes:pii is granted', async () => {
    const adaRead = await createToken(ada, ['notes:read'])
    const mine = await rpc({ bearer: adaRead }, 'tools/call', { name: 'my-notes', arguments: {} })
    expect(JSON.stringify(mine.body)).toContain('Ada private note')
    expect(JSON.stringify(mine.body)).not.toContain('Bo private note')

    const withoutPii = await createToken(staff, ['notes:manage'])
    const redacted = await rpc({ bearer: withoutPii }, 'tools/call', { name: 'list-notes', arguments: {} })
    expect(JSON.stringify(redacted.body)).toContain('Bo private note')
    expect(JSON.stringify(redacted.body)).not.toContain('@example.test')

    const withPii = await createToken(staff, ['notes:manage', 'notes:pii'])
    const full = await rpc({ bearer: withPii }, 'tools/call', { name: 'list-notes', arguments: {} })
    expect(JSON.stringify(full.body)).toContain('bo@example.test')
  })

  it('exposes session-only tools to cookie sessions but never to tokens', async () => {
    expect(await toolNames({ cookie: ada })).toContain('session-only')
    const token = await createToken(ada, ['notes:read'])
    expect(await toolNames({ bearer: token })).not.toContain('session-only')
  })

  it('gives an invalid bearer token an empty catalog instead of falling back to a session', async () => {
    expect(await toolNames({ bearer: 'fnu_notarealtoken', cookie: ada })).toEqual([])
  })
})
