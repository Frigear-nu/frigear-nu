// Under the `'/api/**'` guard: only admins get here.
export default defineEventHandler(() => ({ ok: true }))
