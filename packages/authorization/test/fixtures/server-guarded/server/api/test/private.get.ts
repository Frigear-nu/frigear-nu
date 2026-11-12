// Under the `'/api/**'` guard: only users holding `roles:read` get here.
export default defineEventHandler(() => ({ ok: true }))
