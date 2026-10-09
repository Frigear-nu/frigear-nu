import { z } from 'zod/v4'

export const WebsitePageSchema = z.object({
  title: z.string().optional(),
  description: z.string().optional(),
  /** Wrap the rendered body in a `UContainer` (for plain prose pages such as legal). */
  container: z.boolean().optional(),
  pageHeader: z.object({
    title: z.string().optional(),
    description: z.string().optional(),
  }).optional(),
})
