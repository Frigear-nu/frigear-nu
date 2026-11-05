import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cachedTarball, downloadTemplateToDir, gigetCacheDir, repoSource } from '../src/utils/template.ts'

const giget = vi.hoisted(() => ({ downloadTemplate: vi.fn() }))
vi.mock('giget', () => giget)

let cache: string
beforeEach(async () => {
  cache = await mkdtemp(join(tmpdir(), 'frigear-giget-'))
  vi.stubEnv('XDG_CACHE_HOME', cache)
  vi.stubEnv('GIGET_AUTH', '')
  giget.downloadTemplate.mockReset()
})
afterEach(async () => {
  vi.unstubAllEnvs()
  await rm(cache, { recursive: true, force: true })
})

describe('cachedTarball', () => {
  it('is where giget caches a GitHub source', () => {
    expect(cachedTarball(repoSource('.starters/workspace'), '/c')).toBe(join('/c', 'gh', 'Frigear-nu-frigear-nu', 'main.tar.gz'))
    expect(cachedTarball('gh:Frigear-nu/frigear-nu/.starters/mobile#v1.2.0', '/c')).toBe(join('/c', 'gh', 'Frigear-nu-frigear-nu', 'v1.2.0.tar.gz'))
    expect(cachedTarball('gh:org/repo', '/c')).toBe(join('/c', 'gh', 'org-repo', 'main.tar.gz'))
    expect(cachedTarball('npm:some-template', '/c')).toBeUndefined()
  })

  it('uses XDG_CACHE_HOME like giget', () => {
    expect(gigetCacheDir({ XDG_CACHE_HOME: '/x' }, 'darwin')).toBe(resolve('/x', 'giget'))
  })
})

describe('downloadTemplateToDir', () => {
  const source = repoSource('.starters/mobile-standalone')

  const seedCache = async () => {
    const tarball = cachedTarball(source, join(cache, 'giget'))!
    await mkdir(dirname(tarball), { recursive: true })
    await writeFile(tarball, 'stale')
    await writeFile(`${tarball}.json`, '{"etag":"old"}')
    return tarball
  }

  it('never lets giget fall back to a stale cached copy of the repository', async () => {
    const tarball = await seedCache()
    giget.downloadTemplate.mockImplementation(async () => {
      // giget uses the cached tarball when the download fails, so it must be gone by now.
      expect(existsSync(tarball)).toBe(false)
      expect(existsSync(`${tarball}.json`)).toBe(false)
      return { dir: '/out' }
    })
    await downloadTemplateToDir({ template: source, path: 'app' })
    expect(giget.downloadTemplate).toHaveBeenCalledOnce()
  })

  it('reports the failed download with the GIGET_AUTH hint instead', async () => {
    await seedCache()
    giget.downloadTemplate.mockRejectedValue(new Error('Failed to download https://api.github.com/repos/Frigear-nu/frigear-nu/tarball/main: 404 Not Found'))
    await expect(downloadTemplateToDir({ template: source, path: 'app' })).rejects.toThrow(/GIGET_AUTH=\$\(gh auth token\)/)
  })

  it('keeps the cache of other templates', async () => {
    const other = cachedTarball('gh:org/repo', join(cache, 'giget'))!
    await mkdir(dirname(other), { recursive: true })
    await writeFile(other, 'cached')
    giget.downloadTemplate.mockResolvedValue({ dir: '/out' })
    await downloadTemplateToDir({ template: 'gh:org/repo', path: 'app' })
    expect(existsSync(other)).toBe(true)
  })
})
