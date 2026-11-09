import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { $fetch, fetch, setup } from '@nuxt/test-utils/e2e'

const post = (path: string, body: unknown) => fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })

// Server mode: the server middleware applies the rules to every `/api/` request, Auth's endpoints included.
describe('server mode: an `/api/**` guard', async () => {
  await setup({ rootDir: fileURLToPath(new URL('./fixtures/server-api-guarded', import.meta.url)) })

  it('keeps login, register, the session fetch and magic-link confirm reachable under `/api/**`', async () => {
    // Each answers from its own handler (a validation error), not from the guard (401 "Authentication required").
    for (const [path, body] of [
      ['/api/auth/login', {}],
      ['/api/auth/register', {}],
      ['/api/auth/magic-link/confirm', {}],
    ] as const) {
      const response = await post(path, body)
      expect(response.status, `${path}: ${await response.clone().text()}`).toBe(400)
    }
    expect((await fetch('/api/_auth/session')).status).toBe(200)
    expect(await $fetch('/api/_auth/session')).not.toHaveProperty('user')
  })

  it('still guards the rest of the API, and leaves pages alone', async () => {
    expect((await fetch('/api/test/private')).status).toBe(401)
    // Percent-encoded paths are routed decoded, so the guard must match the decoded path too.
    expect((await fetch('/api/%74est/private')).status).toBe(401)
    expect((await fetch('/%61pi/test/private')).status).toBe(401)
    expect((await fetch('/api/test/%70rivate')).status).toBe(401)
    // Paths no rule can be trusted to match are refused.
    expect((await fetch('/api/test%2Fprivate')).status).toBe(400)
    expect((await fetch('/api/test%5Cprivate')).status).toBe(400)
    // Dot segments (`..`, `%2e%2e`) are resolved by the fetch client before sending; `rules.test.ts` covers them.
    expect((await fetch('/')).status).toBe(200)
  })
})
