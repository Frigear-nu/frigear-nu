import type { z } from 'zod/v4'
import type { WebsiteConfigSchema } from '../../shared/schema/config'
import type { WebsitePageSchema } from '../../shared/schema/page'

/**
 * Applies title, description and social meta for the current content page.
 *
 * Precedence: page `seo.*` > page `title`/`description` > `config.yaml` `seo.*`
 * > site config. The layer hardcodes no values: with nothing configured the
 * title is the page's own title, without any suffix.
 */
export const usePageSeo = () => {
  // Locale-suffixed collections share these schemas, but their generated item
  // types form a union, so narrow to the schema types here.
  const config = useConfig().data as Ref<z.infer<typeof WebsiteConfigSchema> | null | undefined>
  const page = useCurrentPage().data as Ref<z.infer<typeof WebsitePageSchema> | null | undefined>
  const site = useSiteConfig()

  const title = computed(() =>
    page.value?.seo?.title
    || page.value?.title
    || stringOrPropValue(config.value?.name, 'long')
    || stringOrPropValue(config.value?.name, 'short'),
  )
  const description = computed(() =>
    page.value?.seo?.description || page.value?.description || config.value?.seo?.description,
  )
  const image = computed(() => page.value?.seo?.image || config.value?.seo?.image)

  const template = computed(() => config.value?.seo?.titleTemplate)

  useHead({
    titleTemplate: (value) => {
      if (!value) return site.name || null
      if (!template.value || !site.name || value === site.name) return value
      return template.value
        .replace('%s', value)
        .replace('%siteName', site.name)
    },
  })

  useSeoMeta({
    title,
    description,
    ogTitle: title,
    ogDescription: description,
    ogImage: image,
    twitterImage: image,
    twitterCard: computed(() => (image.value ? 'summary_large_image' : undefined)),
    robots: computed(() => (page.value?.seo?.noindex ? 'noindex, nofollow' : undefined)),
  })
}
