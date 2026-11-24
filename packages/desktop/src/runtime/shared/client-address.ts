// Local mode under Bun: the client's address, which Nitro's bun preset does not pass on.

export interface BunServerLike { port: number, requestIP?: (request: Request) => { address: string } | null }
export interface BunServeOptions { fetch?: (this: unknown, request: Request, server: BunServerLike) => unknown, [key: string]: unknown }

/**
 * Carries the client's address from `Bun.serve` to the event: Nitro's bun preset drops it (h3 then sees an empty socket
 * address, so `getRequestIP` is `undefined`, and Auth's frigear handoff, which is only offered over loopback, refuses
 * every request). Set by the server on every request, never taken from the client: an incoming copy is removed first.
 */
export const CLIENT_IP_HEADER = 'x-frigear-desktop-client-ip'

/** Wraps the `fetch` handler of `Bun.serve` so every request carries `CLIENT_IP_HEADER` from the socket. */
export function withClientAddress(options: BunServeOptions): BunServeOptions {
  const fetch = options.fetch
  if (!fetch) return options
  return {
    ...options,
    fetch(this: unknown, request: Request, server: BunServerLike) {
      const headers = new Headers(request.headers)
      headers.delete(CLIENT_IP_HEADER)
      const address = server.requestIP?.(request)?.address
      if (address) headers.set(CLIENT_IP_HEADER, address)
      return fetch.call(this, new Request(request, { headers }), server)
    },
  }
}
