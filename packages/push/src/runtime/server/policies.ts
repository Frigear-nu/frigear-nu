// `definePolicy` is auto-imported in server code. A policy only narrows what the roles allow.
// `push:devices` is held by every signed-in user, so this keeps it to their own devices.
export const ownPushDevice = definePolicy<{ userId: number }>('push:devices', ({ user, record }) => record.userId === Number(user.id))
