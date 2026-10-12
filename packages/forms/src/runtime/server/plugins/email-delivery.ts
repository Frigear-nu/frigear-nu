import { composeEmail, renderAnswers } from '../../utils/template'
import { resolveEmailDelivery } from '../../utils'

// Emails a submission to `definition.delivery.email.to` through @frigear-nu/notify (the host app
// chooses the driver). Throwing marks the submission's delivery as failed.
export default defineNitroPlugin((nitro) => {
  nitro.hooks.hook('forms:submitted', async (ctx) => {
    const email = ctx.form.definition.delivery?.email
    if (!email) return

    const { to, replyTo } = resolveEmailDelivery(email, ctx.answers)
    if (!to.length) return

    const { subject, body, text } = composeEmail(email, {
      form: { name: ctx.form.name, slug: ctx.form.slug, version: ctx.form.version },
      submission: { id: ctx.submissionId, createdAt: new Date().toISOString(), locale: ctx.locale },
      answers: renderAnswers(ctx.form.definition, ctx.answers, ctx.locale),
      files: ctx.files.map(file => `${file.filename} (${file.fieldKey})`),
      replyTo,
    })

    await dispatchEmailNotification({
      to,
      ...(replyTo ? { replyTo } : {}),
      subject,
      body,
      text,
      meta: { formSlug: ctx.form.slug, submissionId: ctx.submissionId },
    })
    ctx.delivered = true
  })
})
