import { z } from 'zod'

// One text for every language, or a locale -> text map. Empty entries are dropped and a map needs at least one text.
export const groupText = z.union([
  z.string().trim().min(1),
  z.record(z.string(), z.string())
    .transform(value => Object.fromEntries(Object.entries(value).filter(([, text]) => text.trim())))
    .refine(value => Object.keys(value).length > 0, 'Add a text in at least one language.'),
])

const slug = z.string().min(1).max(100).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use lowercase letters, digits and dashes.')
const icon = z.string().trim().max(100).regex(/^i-[a-z0-9-]+:[a-z0-9-]+$|^i-[a-z0-9-]+$/i, 'Use an icon name like i-lucide-users.')

export const groupInput = z.object({
  slug,
  name: groupText,
  description: groupText.nullish(),
  icon: icon.nullish(),
})

export const groupPatch = groupInput.partial()

export const memberInput = z.object({ userId: z.number().int().positive() })
