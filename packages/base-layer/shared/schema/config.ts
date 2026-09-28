import { z } from 'zod/v4'

export const WebsiteConfigSchema = z.object({
  name: z.union([
    z.string(),
    z.object({
      long: z.string(),
      short: z.string().optional(),
    }),
  ]).optional(),
  logo: z.union([
    z.string(),
    z.object({
      light: z.string(),
      dark: z.string(),
      class: z.string().optional(),
      alt: z.string().optional(),
    }),
  ]).optional(),
  navigation: z.array(
    z.object({
      label: z.string(),
      description: z.string().optional(),
      to: z.string(),
      icon: z.string().optional(),
      tags: z.array(z.string()).optional(),
    }),
  ).optional(),
  footer: z.object({
    sections: z.array(z.object({
      label: z.string(),
      icon: z.string().optional(),
      links: z.array(z.object({
        label: z.string(),
        to: z.string(),
        icon: z.string().optional(),
      })),
    })).optional(),
    copyright: z.string().optional(),
    right: z.array(z.object({
      label: z.string(),
      to: z.string(),
      icon: z.string().optional(),
      variant: z.string().optional(),
      size: z.string().optional(),
    })).optional(),
  }).optional(),
})
