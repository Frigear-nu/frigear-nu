<script lang="ts" setup>
import { Body, Head, Html, Tailwind } from '@vue-email/components'
import { emailTailwindConfig } from '../config'
</script>

<template>
  <Html lang="en">
    <Head>
      <slot name="head" />
    </Head>
    <Body>
      <Tailwind :config="emailTailwindConfig">
        <slot />
      </Tailwind>
    </Body>
  </Html>
</template>
