<script setup lang="ts">
// Server-rendered: `$api` forwards the incoming credentials to this app's own URLs only.
const { $api } = useNuxtApp()
const url = useRequestURL()
// The same server under another host name is another origin.
const otherHost = url.hostname === '127.0.0.1' ? 'localhost' : '127.0.0.1'
const other = `${url.protocol}//${otherHost}:${url.port}/api/test/echo`
const { data } = await useAsyncData('api-check', async () => ({
  own: await $api<{ cookie: string | null, authorization: string | null }>('/api/test/echo'),
  ownUrl: await $api<{ cookie: string | null, authorization: string | null }>(`${url.origin}/api/test/echo`),
  other: await $api<{ cookie: string | null, authorization: string | null }>(other),
  otherBase: await $api<{ cookie: string | null, authorization: string | null }>('/api/test/echo', { baseURL: `${url.protocol}//${otherHost}:${url.port}` }),
}))
const { data: viaUseApi } = await useApi<{ cookie: string | null }>('/api/test/echo')
const auth = useAuth()
</script>

<template>
  <pre id="result">{{ JSON.stringify({ ...data, useApi: viaUseApi, status: auth.status.value, token: 'n/a' }) }}</pre>
</template>
