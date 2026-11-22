import { searchText } from '@frigear-nu/module-kit/server'

/**
 * `inbox_threads.searchText`: the (cleaned) subject, folded; always empty for an anonymised thread, whose subject is
 * gone. Written on create, when a thread gets its first subject, cleared on anonymise, and by `search:reindex`.
 */
export const inboxThreadSearchText = (thread: { subject: string | null, anonymisedAt?: Date | null }): string =>
  thread.anonymisedAt ? '' : searchText(thread.subject)
