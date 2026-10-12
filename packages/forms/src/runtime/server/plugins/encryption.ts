// Derives the encryption key for per-form secrets at startup (see utils/crypto.ts for the fallbacks).
export default defineNitroPlugin(() => {
  const config = useRuntimeConfig() as { forms: { encryptionKey?: string }, encryptionKey?: string, session?: { password?: string } }
  initEncryptionKey(config.forms.encryptionKey || config.encryptionKey || config.session?.password)
})
