import { db, schema } from '@nuxthub/db'
import { z } from 'zod'
import { apiError, forbidden } from '@frigear-nu/module-kit/server'

// `POST /api/auth/webauthn/register`: adds a passkey to the signed-in account, or signs up with one. With `verifyEmail`
// on, signing up with a passkey is refused: a passkey proves nothing about the address, so the account is created
// through a verified channel first (register, magic link) and the passkey added from it.
export default defineWebAuthnRegisterEventHandler({
  async storeChallenge(_event, challenge, attemptId) {
    await useStorage().setItem(`webauthn:registration:${attemptId}`, challenge)
  },
  async getChallenge(_event, attemptId) {
    const key = `webauthn:registration:${attemptId}`
    const challenge = await useStorage().getItem<string>(key)
    await useStorage().removeItem(key)

    if (!challenge) throw apiError(400, 'challenge_expired', 'Registration challenge expired.')

    return challenge
  },
  async validateUser(userBody, event) {
    const session = await getUserSession(event)

    const body = z.object({
      userName: z.string().trim().toLowerCase().email(),
      displayName: z.string().trim().max(100).optional(),
    }).parse(userBody)

    if (session.user?.email && session.user.email.toLowerCase() !== body.userName) {
      throw apiError(400, 'email_mismatch', 'Email does not match the current session.')
    }

    return body
  },
  async onSuccess(event, { credential, user }) {
    const users = useAuthUserStore()
    let dbUser = await users.findByEmail(user.userName)
    let createdUserId: number | null = null

    if (dbUser) {
      const session = await getUserSession(event)
      if (session.user?.email?.toLowerCase() !== dbUser.email.toLowerCase()) {
        throw forbidden('Authenticate before adding a passkey to this account.')
      }
    }
    else {
      if (useRuntimeConfig(event).public.authentication?.verifyEmail) {
        throw apiError(403, 'email_verification_required', 'Sign up and verify your email address before adding a passkey.')
      }
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
