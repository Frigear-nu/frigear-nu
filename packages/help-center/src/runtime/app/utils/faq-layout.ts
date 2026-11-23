import type { FaqCardProps } from '../../../types'

/** How `FaqSectionList` lays out its cards: the classes of its list and what it passes to every card. */
export type FaqSectionListLayout = {
  list: string
  card: Pick<FaqCardProps, 'variant' | 'spotlight'>
}

/**
 * One card reads as the section itself: its questions at reading width in the middle, without a card frame around
 * them. Several cards share a grid that fills the width it gets, measured on the list's own container so the grid fits
 * a full-width page section and a narrow article alike (Tailwind container queries; the component sets `@container`).
 */
export function faqSectionListLayout(count: number): FaqSectionListLayout {
  if (count <= 1) {
    return { list: 'mx-auto w-full max-w-3xl', card: { variant: 'naked', spotlight: false } }
  }
  return {
    list: count === 2 ? 'grid items-start gap-6 @2xl:grid-cols-2' : 'grid items-start gap-6 @2xl:grid-cols-2 @5xl:grid-cols-3',
    card: {},
  }
}

/** How many cards a source will give before they are loaded: its categories and inline items. */
export function faqSectionListExpected(source: { categories?: string | string[], items?: readonly unknown[] }): number {
  const categories = typeof source.categories === 'string'
    ? source.categories.split(',').map(slug => slug.trim()).filter(Boolean)
    : source.categories ?? []
  return categories.length + (source.items?.length ?? 0)
}
