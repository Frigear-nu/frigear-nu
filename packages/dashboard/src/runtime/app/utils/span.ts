/**
 * Grid classes of an item spanning `span` columns of `DashboardGrid`: one column below `md`, up to two from `md` and
 * up to four from `xl`. Static strings, so Tailwind sees every class.
 */
const spans: Record<1 | 2 | 3 | 4, string> = {
  1: '',
  2: 'md:col-span-2',
  3: 'md:col-span-2 xl:col-span-3',
  4: 'md:col-span-2 xl:col-span-4',
}

export function dashboardSpanClass(span?: number): string {
  const key = Math.min(4, Math.max(1, Math.trunc(span ?? 1))) as 1 | 2 | 3 | 4
  return spans[key]
}
