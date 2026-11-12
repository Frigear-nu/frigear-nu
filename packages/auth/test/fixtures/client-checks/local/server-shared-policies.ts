import { getHeader } from 'h3'

// A "shared" policy file that imports server code, which client mode must refuse like server mode does.
export const broken = { permission: 'notes:read', handler: () => !!getHeader }
