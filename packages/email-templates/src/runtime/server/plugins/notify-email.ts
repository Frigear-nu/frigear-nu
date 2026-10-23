import { emailTemplates } from '#email-templates'
import type { EmailTemplateName, EmailTemplateProps } from '../../types'

/**
 * Renders notifications that name a template (`notification.template`, set by modules for the
 * emails they send) before notify hands them to the driver. A template that is missing or fails to
 * render leaves the notification as built, so the module's plain fallback still goes out.
 */
export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('notify:email', async (context) => {
    const template = context.notification.template
    if (!template || !(template.name in emailTemplates)) return
    try {
      const name = template.name as EmailTemplateName
      const rendered = await renderEmailTemplate(name, (template.props ?? {}) as EmailTemplateProps<typeof name>, {
        locale: template.locale,
      })
      context.notification = {
        ...context.notification,
        subject: rendered.subject ?? context.notification.subject,
        body: rendered.body,
        text: rendered.text ?? context.notification.text,
      }
    }
    catch (error) {
      console.error(`[@frigear-nu/email-templates] Rendering "${template.name}" failed; sending the fallback.`, error)
    }
  })
})
