// Test-only: what the `auth:user:created` listener of `server/plugins/user-created.ts` saw, in order.
export default defineEventHandler(() => (globalThis as { __authCreated?: unknown[] }).__authCreated ?? [])
