/**
 * Whether a resolved route is a page of the app, so it can be reached by client-side navigation. Unmatched paths and
 * paths only a catch-all page (`[...path].vue`, `/:path(.*)*`) matches are treated as server routes.
 */
export const isAppPage = (matched: readonly { path: string }[]): boolean =>
  matched.length > 0 && !matched.some(record => record.path.includes('(.*)'))
