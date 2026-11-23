import type { H3Event } from 'h3'
import { queryCollection } from '#help-center/optional'
import type { HelpContentArticle, HelpContentRow } from '../../utils/content'
import { createContentSource } from '../content-source'
import type { ContentQuery } from '../content-source'
import { helpCenterRequiredLocales } from './help-center-db'

type ContentConfig = { collection: string | null, perLocale: boolean }

/** The `content` settings (server-only runtime config), or `null` collection when Nuxt Content is not a source. */
export function helpCenterContentConfig(): ContentConfig {
  const config = (useRuntimeConfig().helpCenter as { content?: Partial<ContentConfig> } | undefined)?.content
  return { collection: config?.collection ?? null, perLocale: config?.perLocale === true }
}

/** Reads a collection through Nuxt Content (`queryCollection(event, name)` of `@nuxt/content/server`). */
const queryNuxtContent: ContentQuery = async (event: H3Event, collection: string) =>
  (await (queryCollection(event, collection) as unknown as { all: () => Promise<HelpContentRow[]> }).all())

/** A content source for the configured collection, or `undefined` when none is set. Built per call: it only holds options. */
export function helpCenterContentSource(query: ContentQuery = queryNuxtContent) {
  const { collection, perLocale } = helpCenterContentConfig()
  if (!collection) return undefined
  return createContentSource({ collection, perLocale, locales: helpCenterRequiredLocales(), query })
}

/** Every article of the content collection with its languages (none without Nuxt Content), for checklists and admin. */
export async function helpCenterContentArticles(event: H3Event): Promise<HelpContentArticle[]> {
  return await helpCenterContentSource()?.articles(event) ?? []
}
