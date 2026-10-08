export default defineEventHandler(() => (globalThis as Record<string, unknown>).__oauthIssued ?? [])
