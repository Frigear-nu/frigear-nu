import type { AccountDocument } from '../../../types'

/** Label in `locale`, falling back to `en`, then the first available value. */
export function documentLabel(document: AccountDocument, locale: string): string {
  if (typeof document.label === 'string') return document.label
  return document.label[locale] ?? document.label.en ?? Object.values(document.label)[0] ?? document.id
}

/** The documents a user with `role` may see: everything without `roles`, otherwise only matching roles. */
export function visibleDocuments(documents: AccountDocument[], role: string | undefined): AccountDocument[] {
  return documents.filter(document => !document.roles?.length || (!!role && document.roles.includes(role)))
}
