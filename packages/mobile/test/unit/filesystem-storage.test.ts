import { describe, expect, it, vi } from 'vitest'
import { createStorage } from 'unstorage'
import { capacitorFilesystemDriver, fileNameOfKey, keyOfFileName } from '../../src/runtime/shared/filesystem-storage'
import type { FilesystemPluginLike } from '../../src/runtime/shared/native'

/** `@capacitor/filesystem` over a Map of paths, failing like the native plugin does for missing files and folders. */
function fakeFilesystem() {
  const files = new Map<string, string>()
  const at = (directory: string, path: string) => `${directory}/${path}`
  const notFound = () => new Error('File does not exist.')
  const plugin: FilesystemPluginLike = {
    readFile: vi.fn(async ({ path, directory }) => {
      const data = files.get(at(directory, path))
      if (data === undefined) throw notFound()
      return { data }
    }),
    writeFile: vi.fn(async ({ path, directory, data }) => {
      files.set(at(directory, path), data)
      return { uri: `file:///${path}` }
    }),
    deleteFile: vi.fn(async ({ path, directory }) => {
      if (!files.delete(at(directory, path))) throw notFound()
    }),
    readdir: vi.fn(async ({ path, directory }) => {
      const prefix = `${at(directory, path)}/`
      const names = [...files.keys()].filter(file => file.startsWith(prefix)).map(file => file.slice(prefix.length))
      if (!names.length) throw new Error('Folder does not exist.')
      return { files: names.map(name => ({ name, type: 'file' })) }
    }),
  }
  return { files, plugin }
}

describe('file names', () => {
  it('turns any key into one safe file name and back', () => {
    for (const key of ['user%3A1:help-center%3Afaqs', '../../etc/passwd', 'a/b\\c?d=1&e', '.', '..', 'æøå 🎪']) {
      const name = fileNameOfKey(key)!
      expect(name).toMatch(/^[\w%\-!'()~]+\.json$/)
      expect(name).not.toContain('/')
      expect(name.startsWith('.')).toBe(false)
      expect(keyOfFileName(name)).toBe(key)
    }
  })

  it('refuses keys too long for a file name, and ignores files that are not entries', () => {
    expect(fileNameOfKey('k'.repeat(300))).toBeUndefined()
    expect(keyOfFileName('.DS_Store')).toBeUndefined()
    expect(keyOfFileName('%E0%A4%A.json')).toBeUndefined()
  })
})

describe('capacitorFilesystemDriver', () => {
  it('stores one JSON file per key in the cache folder, and reads it back', async () => {
    const { files, plugin } = fakeFilesystem()
    const storage = createStorage({ driver: capacitorFilesystemDriver({ filesystem: plugin }) })

    await storage.setItem('user%3A1:crew%3Ame', { v: 1, key: 'crew:me', at: 1, data: [{ id: 1 }] })
    expect([...files.keys()]).toEqual(['CACHE/frigear-cache/user%253A1%3Acrew%253Ame.json'])
    expect(plugin.writeFile).toHaveBeenCalledWith(expect.objectContaining({ directory: 'CACHE', encoding: 'utf8', recursive: true }))
    expect(await storage.getItem('user%3A1:crew%3Ame')).toEqual({ v: 1, key: 'crew:me', at: 1, data: [{ id: 1 }] })
    expect(await storage.hasItem('user%3A1:crew%3Ame')).toBe(true)
    expect(await storage.getKeys()).toEqual(['user%3A1:crew%3Ame'])
  })

  it('reads a missing key or folder as empty', async () => {
    const { plugin } = fakeFilesystem()
    const storage = createStorage({ driver: capacitorFilesystemDriver({ filesystem: plugin }) })
    expect(await storage.getItem('nothing')).toBeNull()
    expect(await storage.hasItem('nothing')).toBe(false)
    expect(await storage.getKeys()).toEqual([])
    await expect(storage.removeItem('nothing')).resolves.toBeUndefined()
  })

  it('removes keys, and clears by prefix', async () => {
    const { files, plugin } = fakeFilesystem()
    const driver = capacitorFilesystemDriver({ filesystem: plugin, base: 'my-cache', directory: 'DATA' })
    const storage = createStorage({ driver })
    await storage.setItem('guest:a', '1')
    await storage.setItem('user%3A1:a', '2')
    await storage.setItem('user%3A1:b', '3')

    await storage.removeItem('user%3A1:b')
    expect((await storage.getKeys()).sort()).toEqual(['guest:a', 'user%3A1:a'])
    // unstorage's own `clear(base)` only clears mounts below `base`: the driver's clears keys by prefix.
    await driver.clear!('user%3A1:', {})
    expect(await storage.getKeys()).toEqual(['guest:a'])
    expect([...files.keys()]).toEqual(['DATA/my-cache/guest%3Aa.json'])
  })

  it('loads the plugin lazily, once', async () => {
    const { plugin } = fakeFilesystem()
    const load = vi.fn(async () => plugin)
    const storage = createStorage({ driver: capacitorFilesystemDriver({ filesystem: load }) })
    await storage.setItem('a', 'x')
    await storage.getItem('a')
    expect(load).toHaveBeenCalledTimes(1)
  })

  it('fails writes of keys too long for a file name, and other filesystem errors', async () => {
    const { plugin } = fakeFilesystem()
    const storage = createStorage({ driver: capacitorFilesystemDriver({ filesystem: plugin }) })
    await expect(storage.setItem('k'.repeat(300), 'x')).rejects.toThrow(/too long/)
    vi.mocked(plugin.readFile).mockRejectedValueOnce(new Error('Disk on fire'))
    await expect(storage.getItem('a')).rejects.toThrow(/Disk on fire/)
  })
})
