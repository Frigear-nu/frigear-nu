// Local mode: the bundled server stops by itself when the Tauri shell that started it goes away, however it went (a
// crash, `kill -9`, a force quit), so it never keeps running with the database open. The shell sets
// `FRIGEAR_DESKTOP_PARENT_WATCH=1` and keeps the sidecar's stdin pipe open for its whole life; the OS closes that pipe
// when the shell dies, on every platform. On Unix a changed parent pid (the server was reparented) is a fallback.
// Without the variable (`nuxt dev`, the server started by hand) nothing is watched.

/** The variable the shell sets on the sidecar to turn the watch on. */
export const PARENT_WATCH_ENV = 'FRIGEAR_DESKTOP_PARENT_WATCH'

/** The parts of `process.stdin` the watch uses. */
export interface WatchedStdin {
  on(event: 'end' | 'close' | 'error', listener: () => void): unknown
  resume(): unknown
}

export interface ParentWatchOptions {
  stdin: WatchedStdin
  /** The current parent pid (read again on every poll). */
  ppid: () => number
  platform: string
  /** Called once, with what gave the parent away. */
  onParentGone: (reason: 'stdin' | 'ppid') => void
  /** How often the parent pid is polled, in ms (Unix only). */
  interval?: number
}

/** Whether the shell asked for the watch. */
export function parentWatchEnabled(env: Record<string, string | undefined>): boolean {
  const value = env[PARENT_WATCH_ENV]
  return !!value && value !== '0' && value !== 'false'
}

/** Starts watching the parent; returns a function that stops the parent pid poll. */
export function watchParent(options: ParentWatchOptions): () => void {
  let gone = false
  let timer: ReturnType<typeof setInterval> | undefined
  const fire = (reason: 'stdin' | 'ppid') => {
    if (gone) return
    gone = true
    clearInterval(timer)
    options.onParentGone(reason)
  }

  // Nothing is ever written to stdin: data is discarded, the end of the stream is the signal.
  options.stdin.on('end', () => fire('stdin'))
  options.stdin.on('close', () => fire('stdin'))
  options.stdin.on('error', () => fire('stdin'))
  options.stdin.resume()

  if (options.platform !== 'win32') {
    const parent = options.ppid()
    timer = setInterval(() => {
      if (options.ppid() !== parent) fire('ppid')
    }, options.interval ?? 1000)
    // The poll alone never keeps the server running.
    ;(timer as { unref?: () => void }).unref?.()
  }
  return () => clearInterval(timer)
}
