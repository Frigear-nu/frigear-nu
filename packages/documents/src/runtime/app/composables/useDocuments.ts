import { translate } from '@frigear-nu/ui/translated'
import type { Translated } from '@frigear-nu/ui/translated'

const DEFAULT_PATHS = {
  documents: '/account/documents',
  admin: '/admin/documents',
}

/** Resolves the (configurable) page paths. */
export function useDocumentsPaths() {
  const pages = (useRuntimeConfig().public.documents as { pages?: Partial<Record<keyof typeof DEFAULT_PATHS, string>> } | undefined)?.pages ?? {}
  return (name: keyof typeof DEFAULT_PATHS) => pages[name] ?? DEFAULT_PATHS[name]
}

/** `text(value)`: a translated text in the visitor's locale, falling back to the default locale, then `en`, then any. */
export function useDocumentText() {
  const locale = useTranslatedLocale()
  const fallback = useTranslatedFallbackLocale()
  return (value: Translated | null | undefined) => translate(value, locale.value, fallback.value)
}

/** `12.3 KB` style size. */
export function formatFileSize(bytes: number | null | undefined): string {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(bytes < 10240 ? 1 : 0)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}
