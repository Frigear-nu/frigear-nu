import { db, schema } from '@nuxthub/db'
import { eq } from 'drizzle-orm'
import type { CrewRuntimeConfig } from '../../../types'

// An application is a submission of an operation's crew form (`crew_settings.formId`): `forms:submitted` registers the
// person as `applied` (or `waitlisted`). A form that does not ask for a signed-in user has no user to register, and
// an application outside the window or after the operation ended is not registered: the apply page does not offer
// the form then, so this only matters for API submissions.
export default defineNitroPlugin((nitro) => {
  nitro.hooks.hook('forms:submitted', async (ctx) => {
    const [settings] = await db.select().from(schema.crewSettings).where(eq(schema.crewSettings.formId, ctx.form.id)).limit(1)
    if (!settings) return
    if (ctx.userId === null) {
      console.warn(`[crew] the application form "${ctx.form.slug}" was submitted without a signed-in user, so nobody was registered`)
      return
    }
    const operation = await findOperationById(settings.operationId)
    if (!operation || crewOpenState(operation, settings) !== 'open') return

    await crewStorePhone(ctx.userId, ctx.answers[(useRuntimeConfig(ctx.event).crew as CrewRuntimeConfig | undefined)?.phoneField ?? 'phone'])
    const result = await crewApply(ctx.event, { operation, settings, userId: ctx.userId, submissionId: ctx.submissionId, locale: ctx.locale })
    if (result) ctx.delivered = true
  })
})
