import { z } from 'zod/v4'

export const WebsiteSeoSchema = z.object({
  /** Overrides `title` in `<title>` and social cards (the page header keeps using `title`). */
  title: z.string().optional(),
  description: z.string().optional(),
  /** Social/OG image, absolute or site-relative. */
  image: z.string().optional(),
  /** Ask search engines not to index this page. */
  noindex: z.boolean().optional(),
})

export const WebsitePageSchema = z.object({
  title: z.string().optional(),
  description: z.string().optional(),
  seo: WebsiteSeoSchema.optional(),
  /** Wrap the rendered body in a `UContainer` (for plain prose pages such as legal). */
  container: z.boolean().optional(),
  pageHeader: z.object({
    title: z.string().optional(),
    description: z.string().optional(),
  }).optional(),
})
