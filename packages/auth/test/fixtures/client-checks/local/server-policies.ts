// A server-only policy file: never bundled into a client-mode app.
export const serverOnly = { permission: 'notes:write', handler: () => false }
