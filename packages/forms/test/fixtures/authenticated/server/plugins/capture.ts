// Test-only listener: records what `forms:submitted` receives and fails on demand.
export const captured: { slug: string, submissionId: string | null, stored: boolean, answers: Record<string, unknown>, files: number }[] = []

export default defineNitroPlugin((nitro) => {
  nitro.hooks.hook('forms:submitted', (ctx) => {
    captured.push({ slug: ctx.form.slug, submissionId: ctx.submissionId, stored: ctx.stored, answers: ctx.answers, files: ctx.files.length })
    if (ctx.form.slug.startsWith('failing')) throw new Error('listener failed')
  })
})
