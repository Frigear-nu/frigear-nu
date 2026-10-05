import { db, schema } from '@nuxthub/db'

import { eq } from 'drizzle-orm'

export default defineWebAuthnAuthenticateEventHandler({
  async storeChallenge(_event, challenge, attemptId) {
    await useStorage().setItem(`attempt:${attemptId}`, challenge)
  },
  async getChallenge(_event, attemptId) {
    const storage = useStorage()
    const key = `attempt:${attemptId}`
    const challenge = await storage.getItem<string>(key)
    await storage.removeItem(key)

    if (!challenge) throw createError({ statusCode: 400, statusMessage: 'Challenge expired.' })

    return challenge
  },
  async allowCredentials(_event, userName) {
    if (!userName) return []

    const user = await db.query.users.findFirst({ where: (t, { eq }) => eq(t.email, userName) })
    if (!user) throw createError({ statusCode: 400, statusMessage: 'User not found.' })

    const credentials = await db.query.userCredentials.findMany({ where: (t, { eq }) => eq(t.userId, user.id) })
    if (!credentials.length) throw createError({ statusCode: 400, statusMessage: 'No passkeys registered for this user.' })

    return credentials.map(credential => ({ id: credential.id }))
  },
  async getCredential(_event, credentialId) {
    const credential = await db.query.userCredentials.findFirst({ where: (t, { eq }) => eq(t.id, credentialId) })
    if (!credential) throw createError({ statusCode: 400, statusMessage: 'Credential not found.' })
    return credential
  },
  async onSuccess(event, { credential, authenticationInfo }) {
    await db.update(schema.userCredentials)
      .set({ counter: authenticationInfo.newCounter })
      .where(eq(schema.userCredentials.id, credential.id))

    const dbUser = await db.query.users.findFirst({ where: (t, { eq }) => eq(t.id, credential.userId) })
    if (!dbUser) throw createError({ statusCode: 400, statusMessage: 'User not found.' })

    await setUserSession(event, { user: mapUserToSession(dbUser) })
  },
})
