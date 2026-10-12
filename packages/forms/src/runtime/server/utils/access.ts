import type { H3Event } from 'h3'
import { and, eq, isNull } from 'drizzle-orm'
import { db, schema } from '@nuxthub/db'
import type { FormAccessInfoDto } from '../../../types'
import { newId, resolveAccess } from '../../utils'

type FormRow = typeof schema.forms.$inferSelect

export const TOKEN_HEADER = 'x-form-token'
export const PASSWORD_HEADER = 'x-form-password'
const TOKEN_PREFIX = 'ffk_'

const toHex = (bytes: ArrayBuffer) => [...new Uint8Array(bytes)].map(byte => byte.toString(16).padStart(2, '0')).join('')

export async function hashToken(token: string): Promise<string> {
  return toHex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token)))
}

/** A new random token (shown once), its hash and its display prefix. */
export async function generateToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  const token = `${TOKEN_PREFIX}${btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '')}`
  return { id: newId('fat'), token, tokenHash: await hashToken(token), prefix: token.slice(0, 8) }
}

/** `Authorization: Bearer <token>` or `x-form-token: <token>`. */
export function readToken(event: H3Event): string | undefined {
  const authorization = getRequestHeader(event, 'authorization')?.trim() ?? ''
  const bearer = authorization.slice(0, 7).toLowerCase() === 'bearer ' ? authorization.slice(7).trim() : ''
  return bearer || getRequestHeader(event, TOKEN_HEADER)?.trim() || undefined
}

const unauthorized = (event: H3Event, message: string, scheme?: string) => {
  if (scheme) setResponseHeader(event, 'www-authenticate', scheme)
  return createError({ statusCode: 401, statusMessage: message, data: { access: true } })
}

async function verifyToken(event: H3Event, form: FormRow) {
  const token = readToken(event)
  if (!token) throw unauthorized(event, 'A form token is required.', 'Bearer')
  const [row] = await db.select({ id: schema.formAccessTokens.id }).from(schema.formAccessTokens).where(and(
    eq(schema.formAccessTokens.formId, form.id),
    eq(schema.formAccessTokens.tokenHash, await hashToken(token)),
    isNull(schema.formAccessTokens.revokedAt),
  )).limit(1)
  if (!row) throw unauthorized(event, 'Invalid or revoked form token.', 'Bearer')
  await db.update(schema.formAccessTokens).set({ lastUsedAt: new Date() }).where(eq(schema.formAccessTokens.id, row.id))
}

async function verifyFormPassword(event: H3Event, form: FormRow) {
  const password = getRequestHeader(event, PASSWORD_HEADER)
  if (!password) throw unauthorized(event, 'A form password is required.')
  await assertPasswordAttemptsLeft(event, form.slug)
  const [row] = await db.select().from(schema.formAccess).where(eq(schema.formAccess.formId, form.id)).limit(1)
  // No password set: nothing can match, the form stays closed.
  if (!row || !await verifyPassword(row.passwordHash, password)) {
    await recordPasswordFailure(event, form.slug)
    throw unauthorized(event, 'Wrong form password.')
  }
}

/**
 * The single access gate of the public routes (definition and submit). Resolves the submitter's user id
 * (when signed in) and throws 401 unless the form's `access.auth` is satisfied. API-only forms are
 * still served here: `availability` only removes the public page.
 */
export async function authorizeFormAccess(event: H3Event, form: FormRow): Promise<{ userId: number | null }> {
  const { auth } = resolveAccess(form.definition)
  const { user } = await getUserSession(event)

  if (auth === 'user' && !user) throw unauthorized(event, 'Sign in to use this form.')
  if (auth === 'token') await verifyToken(event, form)
  if (auth === 'password') await verifyFormPassword(event, form)
  return { userId: user?.id ?? null }
}

/** Public facts the page needs to pick between the form, a gate and "not found". */
export async function describeFormAccess(event: H3Event, form: FormRow): Promise<FormAccessInfoDto> {
  const { user } = await getUserSession(event)
  return { slug: form.slug, name: form.name, access: resolveAccess(form.definition), signedIn: !!user }
}
