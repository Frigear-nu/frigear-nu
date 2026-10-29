import { fileURLToPath } from 'node:url'
import { rm } from 'node:fs/promises'
import { afterAll, describe, it, expect } from 'vitest'
import { $fetch, fetch, setup } from '@nuxt/test-utils/e2e'

async function registerAndGetCookie(payload: { name: string, email: string, password: string }) {
  const response = await fetch('/api/auth/register', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  })
  expect(response.status, await response.text()).toBe(201)
  const cookie = response.headers.get('set-cookie')
  if (!cookie) throw new Error('Expected a session cookie after registering.')
  return cookie
}

async function mcpRegister(name: string, email: string) {
  const response = await fetch('/api/auth/register', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name, email, password: 'supersecret123' }),
  })
  expect(response.status, await response.clone().text()).toBe(201)
  return response.headers.get('set-cookie')!
}

async function mcpRpc(cookie: string | undefined, method: string, params: Json = {}) {
  const response = await fetch('/mcp', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'accept': 'application/json, text/event-stream', ...(cookie ? { cookie } : {}) },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  })
  const text = await response.text()
  const payload = text.trimStart().startsWith('{') ? text : text.split('\n').find(line => line.startsWith('data:'))?.slice(5) ?? '{}'
  return JSON.parse(payload) as { result?: Json, error?: Json }
}

describe('users self-service routes (authenticated)', async () => {
  const dataDir = fileURLToPath(new URL('./fixtures/self-service/.data', import.meta.url))
  await rm(dataDir, { recursive: true, force: true })
  afterAll(() => rm(dataDir, { recursive: true, force: true }))

  await setup({
    rootDir: fileURLToPath(new URL('./fixtures/self-service', import.meta.url)),
    // Running in dev mode lets NuxtHub apply the committed sqlite migrations on startup, so the
    // registered session/db flow can be exercised end-to-end against a real (local) database.
    dev: true, serverStartTimeout: 180_000, setupTimeout: 240_000,
  })

  it('updates the profile for the logged-in user', async () => {
    const cookie = await registerAndGetCookie({ name: 'Ada Lovelace', email: 'ada@example.com', password: 'supersecret123' })

    const result = await $fetch('/api/users/me/profile', {
      method: 'POST',
      headers: { cookie },
      body: { name: 'Ada Updated' },
    })

    expect(result).toHaveProperty('id')
  })

  it('validates the profile request body', async () => {
    const cookie = await registerAndGetCookie({ name: 'Grace Hopper', email: 'grace@example.com', password: 'supersecret123' })

    await expect($fetch('/api/users/me/profile', {
      method: 'POST',
      headers: { cookie },
      body: { name: '' },
    })).rejects.toMatchObject({ statusCode: 400 })
  })

  it('changes the email address for the logged-in user', async () => {
    const cookie = await registerAndGetCookie({ name: 'Margaret Hamilton', email: 'margaret@example.com', password: 'supersecret123' })

    const result = await $fetch('/api/users/me/change-email', {
      method: 'POST',
      headers: { cookie },
      body: { email: 'margaret-new@example.com' },
    })

    expect(result).toHaveProperty('id')
  })

  it('rejects changing the email address to one already in use', async () => {
    await registerAndGetCookie({ name: 'Katherine Johnson', email: 'katherine@example.com', password: 'supersecret123' })
    const cookie = await registerAndGetCookie({ name: 'Dorothy Vaughan', email: 'dorothy@example.com', password: 'supersecret123' })

    await expect($fetch('/api/users/me/change-email', {
      method: 'POST',
      headers: { cookie },
      body: { email: 'katherine@example.com' },
    })).rejects.toMatchObject({ statusCode: 409 })
  })

  it('changes the password for the logged-in user', async () => {
    const cookie = await registerAndGetCookie({ name: 'Annie Easley', email: 'annie@example.com', password: 'supersecret123' })

    const result = await $fetch('/api/users/me/change-password', {
      method: 'POST',
      headers: { cookie },
      body: { currentPassword: 'supersecret123', newPassword: 'new-password123', confirmNewPassword: 'new-password123' },
    })

    expect(result).toHaveProperty('id')

    await expect($fetch('/api/auth/login', {
      method: 'POST',
      body: { email: 'annie@example.com', password: 'new-password123' },
    })).resolves.toHaveProperty('id')
  })

  it('rejects an incorrect current password', async () => {
    const cookie = await registerAndGetCookie({ name: 'Mary Jackson', email: 'mary@example.com', password: 'supersecret123' })

    await expect($fetch('/api/users/me/change-password', {
      method: 'POST',
      headers: { cookie },
      body: { currentPassword: 'wrong-password', newPassword: 'new-password123', confirmNewPassword: 'new-password123' },
    })).rejects.toMatchObject({ statusCode: 401 })
  })

  it('rejects mismatched new passwords', async () => {
    const cookie = await registerAndGetCookie({ name: 'Mae Jemison', email: 'mae@example.com', password: 'supersecret123' })

    await expect($fetch('/api/users/me/change-password', {
      method: 'POST',
      headers: { cookie },
      body: { currentPassword: 'supersecret123', newPassword: 'new-password123', confirmNewPassword: 'different-password123' },
    })).rejects.toMatchObject({ statusCode: 400 })
  })

  describe('MCP tools', () => {
    it('shows the profile tool to signed-in users only and returns just their own allow-listed fields', async () => {
      expect((await mcpRpc(undefined, 'tools/list')).result?.tools ?? []).toEqual([])

      const ada = await mcpRegister('Ada', 'mcp-ada@example.com')
      await mcpRegister('Bo', 'mcp-bo@example.com')
      const tools = (await mcpRpc(ada, 'tools/list')).result?.tools.map((tool: { name: string }) => tool.name)
      expect(tools).toContain('get-my-profile')

      const profile = await mcpRpc(ada, 'tools/call', { name: 'get-my-profile', arguments: {} })
      const body = JSON.stringify(profile)
      expect(body).toContain('mcp-ada@example.com')
      expect(body).not.toContain('mcp-bo@example.com')
      expect(body).not.toMatch(/password|hash/i)
    })
  })
})
