import { db, schema } from '@nuxthub/db'
import { eq } from 'drizzle-orm'
import { campaignFormSignup } from '../../utils/forms'

// Only registered with `@frigear-nu/forms` (see `module.ts`): a submission of a form a list maps (`formId` and
// `formFields`) with its consent field ticked signs the person up, with consent source `forms`, as the signup does: a
// pending subscription and the confirmation message with the list's double opt-in. Nothing is answered about the
// address, and a failure is logged, never stopping the submission.
export default defineNitroPlugin((nitro) => {
  nitro.hooks.hook('forms:submitted', async (ctx) => {
    const lists = await db.select().from(schema.campaignLists).where(eq(schema.campaignLists.formId, ctx.form.id))
    for (const list of lists) {
      const signup = campaignFormSignup(list.formFields, ctx.answers)
      if (!signup) continue
      try {
        await campaignsSignup(ctx.event, list, { ...signup, locale: ctx.locale }, 'forms')
      }
      catch (error) {
        console.error(`[campaigns] The submission of the form "${ctx.form.slug}" could not sign up for the list "${list.slug}".`, error)
      }
    }
  })
})
