import { db, schema } from '@nuxthub/db'
import { eq } from 'drizzle-orm'
import { apiError } from '@frigear-nu/module-kit/server'

// One error for every failed passkey sign-in (unknown address, no passkeys, unknown or unverified credential). Only the
// error text is unified: a known address with passkeys still gets its credential ids, so this does not stop
// enumeration.
// TODO(owner): real protection needs discoverable (usernameless) passkeys, with no `allowCredentials` by address.
const invalidCredentials = () => apiError(401, 'invalid_credentials', 'Passkey sign-in failed.')

// `POST /api/auth/webauthn/authenticate`: passkey sign-in (nuxt-auth-utils' two-step WebAuthn flow).
export default defineWebAuthnAuthenticateEventHandler({
  async storeChallenge(_event, challenge, attemptId) {
    await useStorage().setItem(`attempt:${attemptId}`, challenge)
  },
  async getChallenge(_event, attemptId) {
    const storage = useStorage()
    const key = `attempt:${attemptId}`
    const challenge = await storage.getItem<string>(key)
    await storage.removeItem(key)

    if (!challenge) throw apiError(400, 'challenge_expired', 'Challenge expired.')

    return challenge
  },
  async allowCredentials(_event, userName) {
    if (!userName) return []

    const user = await useAuthUserStore().findByEmail(userName.trim().toLowerCase())
    if (!user) throw invalidCredentials()

    const credentials = await db.query.userCredentials.findMany({ where: (t, { eq }) => eq(t.userId, user.id) })
    if (!credentials.length) throw invalidCredentials()

    return credentials.map(credential => ({ id: credential.id }))
  },
  async getCredential(_event, credentialId) {
    const credential = await db.query.userCredentials.findFirst({ where: (t, { eq }) => eq(t.id, credentialId) })
    if (!credential) throw invalidCredentials()
    return credential
  },
  async onSuccess(event, { credential, authenticationInfo }) {
    await db.update(schema.userCredentials)
      .set({ counter: authenticationInfo.newCounter })
      .where(eq(schema.userCredentials.id, credential.id))

    const dbUser = await useAuthUserStore().findById(credential.userId)
    if (!dbUser) throw invalidCredentials()
    // Same rule as password sign-in (`login.post.ts`).
    if (useRuntimeConfig(event).public.authentication?.verifyEmail && !dbUser.emailVerifiedAt) {
      throw apiError(403, 'email_not_verified', 'Please verify your email address before logging in.')
    }

    await setUserSession(event, { user: mapUserToSession(dbUser) })
  },
  // A failed verification (nuxt-auth-utils' bare 400, or a 500 for a malformed response) is the same generic 401;
  // the toolkit errors above pass through as they are.
  async onError(_event, error) {
    if ((error.data as { code?: unknown } | undefined)?.code) throw error
    if (error.statusCode >= 500) console.error('[auth] passkey sign-in failed:', error)
    throw invalidCredentials()
  },
})
