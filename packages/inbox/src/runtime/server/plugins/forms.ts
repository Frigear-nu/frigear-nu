import { db, schema } from '@nuxthub/db'
import { and, eq } from 'drizzle-orm'
import { normaliseEmail } from '../../utils/payloads'

// Only added when `@frigear-nu/forms` is installed. A form is connected to a mailbox by a `form` channel account whose
// `address` is the form's slug (or id): each submission becomes an inbound message. `config.fields` names the answers
// to read (defaults: `name`, `email`, `phone`, `subject`, `message`); without a message field every answer is listed.
type FormFields = { name: string, email: string, phone: string, subject: string, message: string }
const DEFAULT_FIELDS: FormFields = { name: 'name', email: 'email', phone: 'phone', subject: 'subject', message: 'message' }

const text = (value: unknown): string | null => {
  if (typeof value === 'string') return value.trim() || null
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (Array.isArray(value)) return value.map(String).join(', ') || null
  return null
}

export default defineNitroPlugin((nitro) => {
  nitro.hooks.hook('forms:submitted', async (ctx) => {
    const accounts = await db.select().from(schema.inboxChannelAccounts)
      .where(and(eq(schema.inboxChannelAccounts.channel, 'form'), eq(schema.inboxChannelAccounts.enabled, true)))
    const slug = ctx.form.slug.toLowerCase()
    const matching = accounts.filter(account => account.address === slug || account.address === ctx.form.id.toLowerCase())
    for (const account of matching) {
      const fields: FormFields = { ...DEFAULT_FIELDS, ...(account.config?.fields as Partial<FormFields> | undefined) }
      const answers = ctx.answers
      const email = text(answers[fields.email])
      const message = text(answers[fields.message])
      const body = message ?? Object.entries(answers).map(([key, value]) => `${key}: ${text(value) ?? ''}`).join('\n')
      const externalContact = email ? normaliseEmail(email) : ctx.userId ? `user:${ctx.userId}` : `submission:${ctx.submissionId ?? crypto.randomUUID()}`
      try {
        const result = await inboxReceive(ctx.event, 'form', {
          contact: {
            externalId: externalContact,
            name: text(answers[fields.name]),
            email: email ? normaliseEmail(email) : null,
            phone: text(answers[fields.phone]),
            userId: ctx.userId,
          },
          externalId: ctx.submissionId ?? crypto.randomUUID(),
          subject: text(answers[fields.subject]) ?? ctx.form.name,
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
