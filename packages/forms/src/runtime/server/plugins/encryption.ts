import { resolveSecret } from '@frigear-nu/module-kit/secret'

// Sets the encryption key for per-form secrets at startup: the forms key, then the deprecated NUXT_ENCRYPTION_KEY and
// NUXT_SESSION_PASSWORD fallbacks (kept so data encrypted with them stays readable), then a key derived from
// NUXT_APP_SECRET. requireKey in utils/crypto.ts resolves the same chain synchronously.
export default defineNitroPlugin(async () => {
  const config = useRuntimeConfig() as { forms: { encryptionKey?: string }, encryptionKey?: string, session?: { password?: string } }
  initEncryptionKey(await resolveSecret(ENCRYPTION_KEY_PURPOSE, config.forms.encryptionKey, config.encryptionKey, config.session?.password))
})
