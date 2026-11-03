<script setup lang="ts">
// The request's origin comes from the Host header, which the client chooses: own-origin URLs must stay in-process.
type Echo = { cookie: string | null, authorization: string | null }
const { $api } = useNuxtApp()
const url = useRequestURL()
const { data } = await useAsyncData('api-host-check', async () => ({
  origin: url.origin,
  ownUrl: await $api<Echo>(`${url.origin}/api/test/echo`),
  ownUrlObject: await $api<Echo>(new URL('/api/test/echo', url)),
  ownBase: await $api<Echo>('/api/test/echo', { baseURL: url.origin }),
}))
</script>

<template>
  <pre id="result">{{ JSON.stringify(data) }}</pre>
</template>
