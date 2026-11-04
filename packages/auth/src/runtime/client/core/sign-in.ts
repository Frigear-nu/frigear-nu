import type { AuthorizationUserAgent, CallbackResult, OAuthClient } from './types'

export interface SignInFlow {
  /** From `login()` until the redirect came back (signed in or failed) or the user closed the browser. */
  readonly signingIn: boolean
  login(options?: { returnTo?: string, params?: Record<string, string> }): Promise<void>
  complete(callbackUrl: string): Promise<CallbackResult>
}

/**
 * Tracks one sign-in through the user agent: `signingIn` turns off when the user dismisses the browser, except while
 * the redirect is already being exchanged for tokens. The pending authorization stays stored on dismissal, so a
 * redirect that still arrives completes normally.
 */
export function createSignInFlow(client: OAuthClient, options: { userAgent: AuthorizationUserAgent, onChange?: (signingIn: boolean) => void }): SignInFlow {
  let signingIn = false
  // True while the redirect is being exchanged, so closing the browser then does not end the sign-in.
  let completing = false
  const set = (value: boolean) => {
    if (signingIn === value) return
    signingIn = value
    options.onChange?.(value)
  }

  return {
    get signingIn() {
      return signingIn
    },

    async login(request) {
      set(true)
      try {
        const { url } = await client.startAuthorization(request)
        await options.userAgent.open(url, {
          redirectUri: client.redirectUri,
          onDismissed: () => {
            if (!completing) set(false)
          },
        })
      }
      catch (error) {
        set(false)
        throw error
      }
    },

    async complete(callbackUrl) {
      completing = true
      set(true)
      try {
        return await client.handleCallback(callbackUrl)
      }
      finally {
        completing = false
        set(false)
        await options.userAgent.close?.().catch(() => undefined)
      }
    },
  }
}
