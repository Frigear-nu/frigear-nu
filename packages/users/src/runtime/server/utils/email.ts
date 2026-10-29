import { db, schema } from '@nuxthub/db'
import { eq, sql } from 'drizzle-orm'
import { conflict } from '@frigear-nu/module-kit/server'

/** How every email is stored: trimmed and lowercased, so `Ada@Example.com` and `ada@example.com` are one account. */
export const normalizeUserEmail = (email: string) => email.trim().toLowerCase()

/** Whether two addresses are the same account (trimmed, case-insensitive). */
export const sameUserEmail = (a: string, b: string) => normalizeUserEmail(a) === normalizeUserEmail(b)

/**
 * The user holding `email`, case-insensitively. The exact (normalised) address is looked up first, which the unique
 * index on `users.email` answers; only on a miss does it fall back to `lower(email) = ?` (a scan), for rows stored
 * before emails were normalised. The same SQL on sqlite and postgresql. Used by the auth user store too.
 */
export async function findUserByEmail(email: string) {
  const address = normalizeUserEmail(email)
  const [exact] = await db.select().from(schema.users).where(eq(schema.users.email, address)).limit(1)
  if (exact) return exact
  const [legacy] = await db.select().from(schema.users).where(sql`lower(${schema.users.email}) = ${address}`).limit(1)
  return legacy ?? null
}

/**
 * Throws 409 `conflict` when another user holds `email` (case-insensitively). `exceptUserId` is the user the address
 * is being written to, who may already hold it.
 */
export async function assertEmailAvailable(email: string, options: { exceptUserId?: number, message?: string } = {}) {
  const holder = await findUserByEmail(email)
  if (holder && holder.id !== options.exceptUserId) {
    throw conflict(options.message ?? 'A user with this email already exists.', { field: 'email' })
  }
}
