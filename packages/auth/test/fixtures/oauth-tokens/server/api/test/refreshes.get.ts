export default defineEventHandler(() => ({ count: (globalThis as { __refreshes?: number }).__refreshes ?? 0 }))
