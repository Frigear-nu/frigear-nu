import { seedForms } from '../utils/seed'

// Opt-in: only runs when `forms.seed.enabled` is true (e.g. NUXT_FORMS_SEED_ENABLED=true).
export default defineNitroPlugin(async () => {
  const { seed } = useRuntimeConfig().forms
  if (!seed.enabled || !seed.forms.length) return
  try {
    const { inserted, skipped } = await seedForms(seed.forms)
    console.info(`[forms] seed: inserted ${inserted.length}, skipped ${skipped.length} existing`)
  }
  catch (error) {
    console.error('[forms] seed failed:', error)
  }
})
