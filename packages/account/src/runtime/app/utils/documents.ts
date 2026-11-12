import type { AccountDocument } from '../../../types'

/** Label in `locale`, falling back to `en`, then the first available value. */
export function documentLabel(document: AccountDocument, locale: string): string {
  if (typeof document.label === 'string') return document.label
  return document.label[locale] ?? document.label.en ?? Object.values(document.label)[0] ?? document.id
}

/**
 * The documents the viewer may see: everything without a `permission`, otherwise only those `can` allows. Without a `can`
 * (no access layer installed) a document with a permission is hidden.
 */
export function visibleDocuments(documents: AccountDocument[], can?: (permission: string) => boolean): AccountDocument[] {
  return documents.filter(document => !document.permission || !!can?.(document.permission))
}
