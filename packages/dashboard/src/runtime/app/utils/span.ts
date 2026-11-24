/**
 * Grid classes of an item spanning `span` columns of `DashboardGrid`: one column below its two-column width, up to two
 * from there and up to four from its four-column width. Container-query classes, so they need `DashboardGrid` (or any
 * `@container` parent). Static strings, so Tailwind sees every class.
 */
const spans: Record<1 | 2 | 3 | 4, string> = {
  1: '',
  2: '@2xl:col-span-2',
  3: '@2xl:col-span-2 @4xl:col-span-3',
  4: '@2xl:col-span-2 @4xl:col-span-4',
}

export function dashboardSpanClass(span?: number): string {
  const key = Math.min(4, Math.max(1, Math.trunc(span ?? 1))) as 1 | 2 | 3 | 4
  return spans[key]
}
