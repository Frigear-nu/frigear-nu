import { db, schema } from '@nuxthub/db'
import { and, eq } from 'drizzle-orm'
import { isEmailAddress, normaliseEmail } from '../../utils/payloads'

// Only added when `@frigear-nu/forms` is installed. A form is connected to a mailbox by a `form` channel account whose
// `address` is the form's slug (or id): each submission becomes an inbound message. `config.fields` names the answers
// to read (defaults: `name`, `email`, `phone`, `subject`, `message`); without a message field every answer is listed.
// The contact is keyed on the email typed into the form. Anybody can type someone else's address, so a submission is
// verified only when a signed-in user typed their own account email: only then does it join that contact's open
// thread, rename it or link it to the account. Anything else (no one signed in, or a signed-in user who typed another
// address) is unverified: it always starts a new thread and never renames the contact or sets its user. A signed-in
// user who typed no email is keyed on their account (`user:<id>`) and verified. A typed value that is not one valid
// address is not stored as the contact's email (nobody could be answered at it).
type FormFields = { name: string, email: string, phone: string, subject: string, message: string }
const DEFAULT_FIELDS: FormFields = { name: 'name', email: 'email', phone: 'phone', subject: 'subject', message: 'message' }

const text = (value: unknown): string | null => {
  if (typeof value === 'string') return value.trim() || null
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (Array.isArray(value)) return value.map(String).join(', ') || null
  return null
}

/** The typed email as stored: one valid address, lower case, else `null`. */
const typedEmail = (value: unknown): string | null => {
  const raw = text(value)
  if (!raw) return null
  const email = normaliseEmail(raw)
  return isEmailAddress(email) ? email : null
}

export default defineNitroPlugin((nitro) => {
  nitro.hooks.hook('forms:submitted', async (ctx) => {
    const accounts = await db.select().from(schema.inboxChannelAccounts)
      .where(and(eq(schema.inboxChannelAccounts.channel, 'form'), eq(schema.inboxChannelAccounts.enabled, true)))
    const slug = ctx.form.slug.toLowerCase()
    const matching = accounts.filter(account => account.address === slug || account.address === ctx.form.id.toLowerCase())
    if (!matching.length) return
    // The signed-in user's own address, to tell whether the typed one is theirs.
    const own = ctx.userId !== null ? (await loadUserRefs([ctx.userId])).get(Number(ctx.userId))?.email?.toLowerCase() ?? null : null
    for (const account of matching) {
      const fields: FormFields = { ...DEFAULT_FIELDS, ...(account.config?.fields as Partial<FormFields> | undefined) }
      const answers = ctx.answers
      const email = typedEmail(answers[fields.email])
      const message = text(answers[fields.message])
      const body = message ?? Object.entries(answers).map(([key, value]) => `${key}: ${text(value) ?? ''}`).join('\n')
      const signedIn = ctx.userId !== null
      const verified = signedIn && (email ? email === own : true)
      const externalContact = email ?? (signedIn ? `user:${ctx.userId}` : `submission:${ctx.submissionId ?? crypto.randomUUID()}`)
      try {
        const result = await inboxReceive(ctx.event, 'form', {
          contact: {
            externalId: externalContact,
            name: text(answers[fields.name]),
            email,
            phone: text(answers[fields.phone]),
            // Never from an unverified submission: the typed address may be someone else's.
            userId: verified ? ctx.userId : null,
          },
          externalId: ctx.submissionId ?? crypto.randomUUID(),
          subject: inboxCleanSubject(text(answers[fields.subject]) ?? ctx.form.name),
          authenticated: verified,
          body,
          attachments: ctx.files.map(file => ({ filename: file.filename, contentType: file.contentType, size: file.size, ...(file.pathname ? { pathname: file.pathname } : {}) })),
        }, account)
        if (result.status !== 'ignored') ctx.delivered = true
      }
      catch (error) {
        console.error(`[inbox] the submission of "${ctx.form.slug}" could not be stored in the inbox`, error)
      }
    }
  })
})
