import { describe, expect, it, vi } from 'vitest'

const fetchMock = vi.fn()
const $fetchMock = vi.fn()
vi.mock('@nuxt/test-utils/e2e', () => ({ fetch: fetchMock, $fetch: $fetchMock }))

const { apiClient, expectApiError, expectSchemaParity } = await import('../src/runtime/testing')

describe('testing entry', () => {
  it('still exports the schema parity helpers', () => {
    expect(typeof expectSchemaParity).toBe('function')
  })

  it('sends the cookie or bearer and JSON bodies', async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }))
    await apiClient({ cookie: 'session=1' }).fetch('POST', '/api/x', { a: 1 })
    expect(fetchMock).toHaveBeenCalledWith('/api/x', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'cookie': 'session=1' },
      body: '{"a":1}',
    })

    $fetchMock.mockResolvedValueOnce(undefined)
    expect(await apiClient({ bearer: 'fnu_x' }).json('DELETE', '/api/x')).toBeNull()
    expect($fetchMock).toHaveBeenCalledWith('/api/x', { method: 'DELETE', headers: { authorization: 'Bearer fnu_x' }, body: undefined })
  })

  it('expectApiError reads a rejected FetchError', async () => {
    const error = Object.assign(new Error('fail'), { statusCode: 403, data: { statusCode: 403, data: { code: 'forbidden' } } })
    await expect(expectApiError(Promise.reject(error), 403, 'forbidden')).resolves.toMatchObject({ data: { code: 'forbidden' } })
    await expect(expectApiError(Promise.reject(error), 404)).rejects.toThrow(/Expected status 404, got 403/)
    await expect(expectApiError(Promise.reject(error), 403, 'not_found')).rejects.toThrow(/Expected error code "not_found"/)
  })

  it('expectApiError reads a Response', async () => {
    const response = new Response(JSON.stringify({ statusCode: 409, data: { code: 'conflict' } }), { status: 409 })
    await expect(expectApiError(Promise.resolve(response), 409, 'conflict')).resolves.toMatchObject({ statusCode: 409 })
    await expect(expectApiError(Promise.resolve(new Response('{}', { status: 200 })), 400)).rejects.toThrow(/got 200/)
  })

  it('expectApiError fails when the request succeeded', async () => {
    await expect(expectApiError(Promise.resolve({ ok: true }), 400)).rejects.toThrow(/but it succeeded/)
  })
})
