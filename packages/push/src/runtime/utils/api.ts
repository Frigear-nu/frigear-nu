// Typed path builders of the push HTTP API. App code, tests and docs use these instead of string literals, so a
// changed URL is changed in one place. Every id is URL-encoded.

const enc = encodeURIComponent

const BASE = '/api/push'

export const pushApi = {
  me: {
    /** `GET` the caller's devices (active ones, newest first) and `POST` to register one (201). Needs `push:devices`. */
    devices: `${BASE}/me/devices`,
    /** `DELETE` one of the caller's devices (204). */
    device: (id: string) => `${BASE}/me/devices/${enc(id)}`,
    /** `POST { token }` to unregister by token (204), so an app that only knows its token can sign out cleanly. */
    unregister: `${BASE}/me/devices/unregister`,
    /** `GET` the channel matrix of the registered topics and `PUT` changes to it. */
    channels: `${BASE}/me/channels`,
  },
  admin: {
    /** `GET` one user's devices (staff, `push:manage`); mounted on the users admin. */
    userDevices: (userId: number | string) => `/api/admin/users/${enc(String(userId))}/push-devices`,
    /** `POST { userId }` sends a test push (staff, `push:send`). */
    test: '/api/admin/push/test',
  },
} as const
