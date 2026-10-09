import { answersToHtml, answersToText, escapeHtml, renderAnswers } from '../utils/render'
import { translate } from '../../utils'

// Emails a submission to `definition.delivery.email.to` through @frigear-nu/notify (the host app
// chooses the driver). Throwing marks the submission's delivery as failed.
export default defineNitroPlugin((nitro) => {
  nitro.hooks.hook('forms:submitted', async (ctx) => {
    const email = ctx.form.definition.delivery?.email
    if (!email?.to.length) return

    const rows = renderAnswers(ctx.form.definition, ctx.answers, ctx.locale)
    const subject = translate(email.subject, ctx.locale) || `New submission: ${ctx.form.name}`
    const fileNames = ctx.files.map(file => `${file.filename} (${file.fieldKey})`)

    await dispatchEmailNotification({
      to: email.to,
      subject,
      body: `<p><strong>${escapeHtml(ctx.form.name)}</strong></p>${answersToHtml(rows)}`
        + (fileNames.length ? `<p>Files stored with the submission: ${escapeHtml(fileNames.join(', '))}</p>` : ''),
      text: answersToText(rows) + (fileNames.length ? `\n\nFiles stored with the submission: ${fileNames.join(', ')}` : ''),
      meta: { formSlug: ctx.form.slug, submissionId: ctx.submissionId },
    })
    ctx.delivered = true
  })
})
