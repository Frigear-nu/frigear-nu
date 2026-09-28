import { z } from 'zod/v4'

export const WebsitePageSchema = z.object({
  title: z.string().optional(),
  description: z.string().optional(),
  pageHeader: z.object({
    title: z.string().optional(),
    description: z.string().optional(),
  }).optional(),
})
