import { db, schema } from '@nuxthub/db'
import { eq } from 'drizzle-orm'
import type { CrewRuntimeConfig } from '../../../types'

// An application is a submission of an operation's crew form (`crew_settings.formId`): `forms:submitted` registers the
// person as `applied` (or `waitlisted`). A form that does not ask for a signed-in user has no user to register, and an
// application is not registered outside the window, after the operation ended, or from somebody who may not read the
// operation (a private one): the apply page does not offer the form then, so this only matters for API submissions.
// A submission that was delivered already (redelivery from forms' admin, or a retry) or that is older than the person's
// last decision registers nothing and stores no phone number.
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
    if (!await crewUserReadsOperation(ctx.event, operation, ctx.userId)) return

    if (ctx.submissionId) {
      const [stored] = await db.select({ id: schema.teamMembers.id }).from(schema.teamMembers).where(eq(schema.teamMembers.submissionId, ctx.submissionId)).limit(1)
      if (stored) return
      const [submission] = await db.select({ createdAt: schema.formSubmissions.createdAt }).from(schema.formSubmissions).where(eq(schema.formSubmissions.id, ctx.submissionId)).limit(1)
      const entry = await findCrewEntry(ctx.userId, operation.id)
      const since = entry?.member.decidedAt ?? entry?.member.appliedAt
      if (submission && since && submission.createdAt.getTime() < since.getTime()) return
    }

    const result = await crewApply(ctx.event, { operation, settings, userId: ctx.userId, submissionId: ctx.submissionId, locale: ctx.locale })
    if (!result) return
    // The phone number belongs to an application that registered somebody (a new one, or a reopened one).
    if (result.created) await crewStorePhone(ctx.userId, ctx.answers[(useRuntimeConfig(ctx.event).crew as CrewRuntimeConfig | undefined)?.phoneField ?? 'phone'])
    ctx.delivered = true
  })
})
