<script setup lang="ts">
// Server-rendered: `$api` forwards the incoming credentials to this app's own URLs only.
type Echo = { cookie: string | null, authorization: string | null }
const { $api } = useNuxtApp()
const url = useRequestURL()
// The same server under another host name is another origin.
const otherOrigin = `${url.protocol}//${url.hostname === '127.0.0.1' ? 'localhost' : '127.0.0.1'}:${url.port}`
const { data } = await useAsyncData('api-check', async () => ({
  own: await $api<Echo>('/api/test/echo'),
  ownUrl: await $api<Echo>(`${url.origin}/api/test/echo`),
  ownUrlObject: await $api<Echo>(new URL(`${url.origin}/api/test/echo`)),
  other: await $api<Echo>(`${otherOrigin}/api/test/echo`),
  otherBase: await $api<Echo>('/api/test/echo', { baseURL: otherOrigin }),
  // A caller's hook that moves the request elsewhere: the credentials are attached after it.
  otherByHook: await $api<Echo>('/api/test/echo', { onRequest: ({ options }) => void (options.baseURL = otherOrigin) }),
  // The caller's own headers win over the forwarded ones.
  ownHeaders: await $api<Echo>('/api/test/echo', { headers: new Headers({ authorization: 'Bearer service' }) }),
  // A 401 while signed out only rejects.
  refused: await $api('/api/test/refuse').then(() => 'resolved', (error: { statusCode?: number }) => error.statusCode),
}))
const { data: viaUseApi } = await useApi<Echo>('/api/test/echo')
const auth = useAuth()
const contract = {
  status: auth.status.value,
  authenticated: auth.authenticated.value,
  signingIn: auth.signingIn.value,
  token: await auth.getAccessToken(),
  callback: auth.isCallbackUrl(`${url.origin}/auth/callback?code=x&state=y`),
  complete: await auth.completeLogin().then(() => 'resolved', (error: Error) => error.message),
}
</script>

<template>
  <pre id="result">{{ JSON.stringify({ ...data, useApi: viaUseApi, contract }) }}</pre>
</template>
