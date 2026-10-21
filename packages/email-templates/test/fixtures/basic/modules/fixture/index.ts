import { createResolver, defineNuxtModule } from '@nuxt/kit'

// Stands in for a module (auth, users, ...) that ships its own email templates.
export default defineNuxtModule({
  meta: { name: 'fixture' },
  setup(_, nuxt) {
    const { resolve } = createResolver(import.meta.url)
    nuxt.hook('notify:email:templates', (sources) => {
      sources.push({ dir: resolve('./emails') })
      // The templates the workspace modules ship, so the test renders each of them for real.
      for (const pkg of ['auth', 'users', 'subscriptions']) {
        sources.push({ dir: resolve(`../../../../../../${pkg}/src/runtime/emails`) })
      }
    })
  },
})
