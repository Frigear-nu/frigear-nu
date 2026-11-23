import { describe, expect, it } from 'vitest'
import { CLIENT_IP_HEADER, withClientAddress, type BunServerLike } from '../../src/runtime/shared/client-address'

describe('withClientAddress', () => {
  const seen: Request[] = []
  const options = withClientAddress({ port: 0, fetch: (request: Request) => seen.push(request) })
  const call = (headers: Record<string, string>, address: string | null) => {
    const server: BunServerLike = { port: 1, requestIP: () => address === null ? null : { address } }
    options.fetch!.call(undefined, new Request('http://127.0.0.1:1/api', { headers }), server)
    return seen.at(-1)!
  }

  it('passes the socket address on, never the client\'s own header', () => {
    expect(call({}, '127.0.0.1').headers.get(CLIENT_IP_HEADER)).toBe('127.0.0.1')
    expect(call({ [CLIENT_IP_HEADER]: '127.0.0.1' }, '10.0.0.5').headers.get(CLIENT_IP_HEADER)).toBe('10.0.0.5')
    expect(call({ [CLIENT_IP_HEADER]: '127.0.0.1', 'x-other': 'kept' }, null).headers.get(CLIENT_IP_HEADER)).toBeNull()
    expect(seen.at(-1)!.headers.get('x-other')).toBe('kept')
  })

  it('leaves options without a fetch handler alone', () => {
    const plain = { port: 0 }
    expect(withClientAddress(plain)).toBe(plain)
  })
})
