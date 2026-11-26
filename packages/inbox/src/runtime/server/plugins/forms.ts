import { db, schema } from '@nuxthub/db'
import { and, eq } from 'drizzle-orm'
import { renderAnswers, type RenderedAnswer } from '@frigear-nu/forms/utils'
import type { FormDefinition } from '@frigear-nu/forms'
import { isEmailAddress, normaliseEmail } from '../../utils/payloads'

// Only added when `@frigear-nu/forms` is installed. A form is connected to a mailbox by a `form` channel account whose
// `address` is the form's slug (or id): each submission becomes an inbound message. `config.fields` names the answers
// to read (defaults: `name`, `email`, `phone`, `subject`, `message`). Answers are rendered with the form's labels in the
// submission's locale (a select shows its option label, not its value). The message body is the message followed by
// every other answered field as `Label: value` lines (subject, phone, ...), so a submission that joins an open thread
// keeps its subject; without a message field the body lists every answer. The thread subject is the subject answer's label, or
// the answer to a field shown only for it (an "Other, please specify" text).
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

const filled = (rows: RenderedAnswer[]) => rows.filter(row => row.value.trim())

/** The subject: a field shown only for the subject answer (its "specify" text) wins over the subject's own label. */
function formSubject(definition: FormDefinition, rows: RenderedAnswer[], key: string): string | null {
  const detailKeys = new Set(definition.steps.flatMap(step => step.fields).filter(field => field.showIf?.field === key).map(field => field.key))
  const value = (row?: RenderedAnswer) => row?.value.trim() || null
  return value(rows.find(row => detailKeys.has(row.key) && row.value.trim())) ?? value(rows.find(row => row.key === key))
}

/** The message, then the other answered fields (below it, so the thread preview stays the message); every answer when there is no message. */
function formBody(rows: RenderedAnswer[], fields: FormFields, message: string | null): string {
  const lines = (list: RenderedAnswer[]) => list.map(row => `${row.label}: ${row.value}`).join('\n')
  if (!message) return lines(filled(rows))
  const skip = new Set([fields.name, fields.email, fields.message])
  const header = lines(filled(rows).filter(row => !skip.has(row.key)))
  return header ? `${message}\n\n${header}` : message
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
      const rows = renderAnswers(ctx.form.definition, answers, ctx.locale)
      const body = rows.length
        ? formBody(rows, fields, message)
        : message ?? Object.entries(answers).map(([key, value]) => `${key}: ${text(value) ?? ''}`).join('\n')
      const subject = (rows.length ? formSubject(ctx.form.definition, rows, fields.subject) : null) ?? text(answers[fields.subject])
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
          subject: inboxCleanSubject(subject ?? ctx.form.name),
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
