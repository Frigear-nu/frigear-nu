// An unstorage driver on `@capacitor/filesystem`: one JSON file per key in a folder of the app's Cache directory, which
// the OS may empty when the device runs out of space (a cache, never the only copy of anything). It backs the
// `useCachedFetch` responses the app keeps across restarts (`mobile.persistentCache`).
import { defineDriver } from 'unstorage'
import type { FilesystemPluginLike } from './native'

export interface CapacitorFilesystemDriverOptions {
  /** The Filesystem plugin (`useCapacitor().load('filesystem')`), or a function that loads it. */
  filesystem: FilesystemPluginLike | (() => Promise<FilesystemPluginLike | null>)
  /** Folder in `directory`. Default `frigear-cache`. */
  base?: string
  /** Capacitor's `Directory`. Default `CACHE` (`Directory.Cache`). */
  directory?: string
}

const EXTENSION = '.json'
/** File names stay well below the 255 bytes iOS and Android allow. */
const MAX_FILE_NAME = 200

/**
 * The file name of a key: URI-encoded, so any key is one safe name (no `/`, no `..`, nothing the OS treats specially)
 * and decodes back to the key. `undefined` when the key is too long for a file name.
 */
export function fileNameOfKey(key: string): string | undefined {
  const name = `${encodeURIComponent(key).replace(/\./g, '%2E').replace(/\*/g, '%2A')}${EXTENSION}`
  return name.length <= MAX_FILE_NAME ? name : undefined
}

/** The key a file name stands for, `undefined` for files that are not entries. */
export function keyOfFileName(name: string): string | undefined {
  if (!name.endsWith(EXTENSION)) return undefined
  try {
    return decodeURIComponent(name.slice(0, -EXTENSION.length))
  }
  catch {
    return undefined
  }
}

const missing = (error: unknown) => /not exist|no such file|not found|ENOENT/i.test(String((error as { message?: string })?.message ?? error))

export const capacitorFilesystemDriver = defineDriver((options: CapacitorFilesystemDriverOptions) => {
  const base = (options.base ?? 'frigear-cache').replace(/^\/+|\/+$/g, '')
  const directory = options.directory ?? 'CACHE'
  let loaded: Promise<FilesystemPluginLike> | undefined
  const fs = () => loaded ??= (typeof options.filesystem === 'function'
    ? options.filesystem().then((plugin) => {
        if (!plugin) throw new Error('[@frigear-nu/mobile] @capacitor/filesystem is not available.')
        return plugin
      })
    : Promise.resolve(options.filesystem))
  const pathOf = (key: string) => {
    const name = fileNameOfKey(key)
    return name ? `${base}/${name}` : undefined
  }

  const list = async (): Promise<string[]> => {
    try {
      const { files } = await (await fs()).readdir({ path: base, directory })
      return files.map(file => typeof file === 'string' ? file : file.name)
    }
    catch (error) {
      // No folder yet: nothing stored.
      if (missing(error)) return []
      throw error
    }
  }
  const remove = async (path: string) => {
    try {
      await (await fs()).deleteFile({ path, directory })
    }
    catch (error) {
      if (!missing(error)) throw error
    }
  }

  const getItem = async (key: string): Promise<string | null> => {
    const path = pathOf(key)
    if (!path) return null
    try {
      const { data } = await (await fs()).readFile({ path, directory, encoding: 'utf8' })
      return typeof data === 'string' ? data : await data.text()
    }
    catch (error) {
      if (missing(error)) return null
      throw error
    }
  }

  return {
    name: 'capacitor-filesystem',
    options,
    hasItem: async key => (await getItem(key)) !== null,
    getItem,
    async setItem(key, value) {
      const path = pathOf(key)
      if (!path) throw new Error(`[@frigear-nu/mobile] The cache key is too long for a file name: ${key.slice(0, 40)}…`)
      await (await fs()).writeFile({ path, data: value, directory, encoding: 'utf8', recursive: true })
    },
    async removeItem(key) {
      const path = pathOf(key)
      if (path) await remove(path)
    },
    async getKeys(prefix) {
      const keys = (await list()).map(keyOfFileName).filter((key): key is string => key !== undefined)
      return prefix ? keys.filter(key => key.startsWith(prefix)) : keys
    },
    async clear(prefix) {
      const names = await list()
      await Promise.all(names
        .filter((name) => {
          const key = keyOfFileName(name)
          return key !== undefined && (!prefix || key.startsWith(prefix))
        })
        .map(name => remove(`${base}/${name}`)))
    },
  }
})
