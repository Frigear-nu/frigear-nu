import type { H3Event } from 'h3'
import { eq } from 'drizzle-orm'
import { db, schema } from '@nuxthub/db'
import type { CaptchaProvider, FormSecretsDto, SecretSource } from '../../../types'
import { captchaProviders } from '../../utils'

/**
 * Per-form secrets live in `form_secrets`, encrypted (AES-256-GCM). Values are write-only: nothing here
 * is returned by an API, logged, or copied into definitions, snapshots, deliveries or exports.
 */

export const captchaSecretKey = (provider: CaptchaProvider) => `captcha.${provider}.secretKey`

/** Secret names that may be stored. Future integrations (webhook signing secrets, ...) add theirs here. */
export const formSecretKeys: readonly string[] = captchaProviders.map(captchaSecretKey)

export const isFormSecretKey = (key: string) => formSecretKeys.includes(key)

/** The decrypted secrets of a form; `unreadable` when they were encrypted with another key. */
export async function readFormSecrets(formId: string): Promise<{ secrets: Record<string, string>, unreadable: boolean }> {
  try {
    const [row] = await db.select({ secrets: schema.formSecrets.secrets }).from(schema.formSecrets).where(eq(schema.formSecrets.formId, formId)).limit(1)
    return { secrets: row?.secrets ?? {}, unreadable: false }
  }
  catch (error) {
    if (!isDecryptionError(error)) throw error
    console.error(`[forms] the stored secrets of form ${formId} cannot be decrypted (changed encryption key?); they must be entered again.`)
    return { secrets: {}, unreadable: true }
  }
}

export async function getFormSecret(formId: string, key: string): Promise<string | undefined> {
  return (await readFormSecrets(formId)).secrets[key] || undefined
}

async function writeFormSecrets(formId: string, secrets: Record<string, string>) {
  if (!Object.keys(secrets).length) {
    await db.delete(schema.formSecrets).where(eq(schema.formSecrets.formId, formId))
    return
  }
  await db.insert(schema.formSecrets).values({ formId, secrets }).onConflictDoUpdate({
    target: schema.formSecrets.formId,
    set: { secrets, updatedAt: new Date() },
  })
}

/** Stores one secret, replacing an existing value; unreadable old secrets are discarded. */
export async function setFormSecret(formId: string, key: string, value: string) {
  const { secrets } = await readFormSecrets(formId)
  await writeFormSecrets(formId, { ...secrets, [key]: value })
}

export async function deleteFormSecret(formId: string, key: string) {
  const { secrets, unreadable } = await readFormSecrets(formId)
  if (unreadable) {
    await writeFormSecrets(formId, {})
    return
  }
  if (!(key in secrets)) return
  const { [key]: _removed, ...rest } = secrets
  await writeFormSecrets(formId, rest)
}

/** Secret key for a provider from the environment / module options (`NUXT_FORMS_CAPTCHA_<PROVIDER>_SECRET_KEY`). */
export function envCaptchaSecret(event: H3Event | undefined, provider: CaptchaProvider): string | undefined {
  return useRuntimeConfig(event).forms.captcha?.[provider]?.secretKey || undefined
}

/** The secret key a captcha check of this form uses: the form's own secret, else the environment one. */
export async function resolveCaptchaSecret(event: H3Event | undefined, provider: CaptchaProvider, formId?: string): Promise<{ secretKey?: string, source: SecretSource }> {
  const own = formId ? await getFormSecret(formId, captchaSecretKey(provider)) : undefined
  if (own) return { secretKey: own, source: 'form' }
  const env = envCaptchaSecret(event, provider)
  return env ? { secretKey: env, source: 'env' } : { source: 'unset' }
}

/** What an admin may know: which secrets are set (never their values) and where each captcha key comes from. */
export async function describeFormSecrets(event: H3Event, formId: string): Promise<FormSecretsDto> {
  const { secrets, unreadable } = await readFormSecrets(formId)
  const captcha = Object.fromEntries(captchaProviders.map((provider): [CaptchaProvider, { source: SecretSource }] => [
    provider,
    { source: secrets[captchaSecretKey(provider)] ? 'form' : envCaptchaSecret(event, provider) ? 'env' : 'unset' },
  ])) as FormSecretsDto['captcha']
  return { keys: Object.keys(secrets).filter(key => secrets[key]).sort(), captcha, unreadable }
}
