const DEFAULT_PATHS = {
  admin: '/admin/groups',
  adminGroup: '/admin/groups/:id',
}

/** Resolves the (configurable) page paths, filling in params. */
export function useGroupsPaths() {
  const pages = (useRuntimeConfig().public.groups as { pages?: Partial<Record<keyof typeof DEFAULT_PATHS, string>> } | undefined)?.pages ?? {}
  return (name: keyof typeof DEFAULT_PATHS, params: Record<string, string> = {}) =>
    Object.entries(params).reduce((path, [key, value]) => path.replace(`:${key}`, encodeURIComponent(value)), pages[name] ?? DEFAULT_PATHS[name])
}
