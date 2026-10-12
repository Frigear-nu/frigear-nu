import { z } from 'zod'

// One text for every language, or a locale -> text map. Empty entries are dropped and a map needs at least one text.
export const documentText = z.union([
  z.string().trim().min(1),
  z.record(z.string(), z.string())
    .transform(value => Object.fromEntries(Object.entries(value).filter(([, text]) => text.trim())))
    .refine(value => Object.keys(value).length > 0, 'Add a text in at least one language.'),
])

const icon = z.string().trim().max(100).regex(/^i-[a-z0-9-]+(:[a-z0-9-]+)?$/i, 'Use an icon name like i-lucide-file-text.')
const common = {
  description: documentText.nullish(),
  icon: icon.nullish(),
  parentId: z.string().min(1).nullish(),
  audience: z.enum(['everyone', 'groups']).optional(),
  groupIds: z.array(z.string().min(1)).max(200).optional(),
  sortOrder: z.number().int().optional(),
}

export const folderInput = z.object({ title: documentText, ...common })

/** Metadata part of an upload; the title defaults to the file name. */
export const uploadMeta = z.object({ ...common, title: documentText.optional() })

export const itemPatch = z.object({ title: documentText.optional(), ...common })
