import { db, schema } from '@nuxthub/db'

import { z } from 'zod'

export default defineWebAuthnRegisterEventHandler({
  async storeChallenge(_event, challenge, attemptId) {
    await useStorage().setItem(`webauthn:registration:${attemptId}`, challenge)
  },
  async getChallenge(_event, attemptId) {
    const key = `webauthn:registration:${attemptId}`
    const challenge = await useStorage().getItem<string>(key)
    await useStorage().removeItem(key)

    if (!challenge) throw createError({ statusCode: 400, statusMessage: 'Registration challenge expired.' })

    return challenge
  },
  async validateUser(userBody, event) {
    const session = await getUserSession(event)

    if (session.user?.email && session.user.email !== userBody.userName) {
      throw createError({ statusCode: 400, statusMessage: 'Email does not match the current session.' })
    }

    return z.object({ userName: z.string().email(), displayName: z.string().trim().max(100).optional() }).parse(userBody)
  },
  async onSuccess(event, { credential, user }) {
    const users = useAuthUserStore()
    let dbUser = await users.findByEmail(user.userName)
    let createdUserId: number | null = null

    if (dbUser) {
      const session = await getUserSession(event)
      if (session.user?.email !== dbUser.email) {
        throw createError({ statusCode: 403, statusMessage: 'Authenticate before adding a passkey to this account.' })
      }
    }
    else {
      dbUser = await users.create({ name: user.userName, email: user.userName })
      createdUserId = dbUser.id
    }

    try {
      await db.insert(schema.userCredentials).values({
        id: credential.id,
        userId: dbUser.id,
        publicKey: credential.publicKey,
        counter: credential.counter,
        backedUp: credential.backedUp,
        transports: credential.transports,
        name: user.displayName || null,
      })
    }
    catch (error) {
      // Do not leave an account without any way to sign in behind when storing the passkey failed.
      if (createdUserId !== null) await users.remove(createdUserId)
      throw error
    }

    await setUserSession(event, { user: mapUserToSession(dbUser) })
  },
})
