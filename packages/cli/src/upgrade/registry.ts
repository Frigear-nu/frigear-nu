const REGISTRY = (process.env.npm_config_registry || 'https://registry.npmjs.org').replace(/\/+$/, '')

/** The `latest` dist-tag of a package on the npm registry, or `undefined` when it is not published (a workspace package). */
export const latestVersion = async (name: string): Promise<string | undefined> => {
  const response = await fetch(`${REGISTRY}/${name.replace('/', '%2f')}`, {
    headers: { accept: 'application/vnd.npm.install-v1+json' },
  })
  if (response.status === 404) return undefined
  if (!response.ok) throw new Error(`npm registry answered ${response.status} for ${name}`)
  const body = await response.json() as { 'dist-tags'?: { latest?: string } }
  return body['dist-tags']?.latest
}

/** `auth@0.6.1,@frigear-nu/users@3.1.0` → `{ '@frigear-nu/auth': '0.6.1', '@frigear-nu/users': '3.1.0' }`. */
export const parseTargets = (value?: string) => {
  const targets: Record<string, string> = {}
  for (const spec of (value ?? '').split(/[\s,]+/).filter(Boolean)) {
    const at = spec.lastIndexOf('@')
    if (at <= 0) throw new Error(`Expected <package>@<version>, got "${spec}"`)
    const name = spec.slice(0, at)
    targets[name.includes('/') ? name : `@frigear-nu/${name}`] = spec.slice(at + 1)
  }
  return targets
}
