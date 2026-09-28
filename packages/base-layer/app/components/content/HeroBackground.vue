<script setup lang="ts">
const { isLoading } = useLoadingIndicator()

// Animation phases:
// 1. Mount -> wait a tick -> fade in (slow, 1s)
// 2. Once fully appeared -> switch to fast transitions (400ms) for loading pulses
const hasAppeared = ref(false)
const isSettled = ref(false)

const APPEAR_DELAY = 0
const SETTLE_DELAY = 1000

let settleTimeout: ReturnType<typeof setTimeout> | undefined

onMounted(async () => {
  await nextTick()
  hasAppeared.value = true

  settleTimeout = setTimeout(() => {
    isSettled.value = true
  }, SETTLE_DELAY)
})

onUnmounted(() => {
  clearTimeout(settleTimeout)
})

const wrapperClasses = computed(() => [
  isLoading.value ? 'animate-pulse' : hasAppeared.value ? '' : 'opacity-0',
  isSettled.value ? 'duration-[400ms]' : 'duration-1000',
])
</script>

<template>
  <ClientOnly>
    <div
      class="absolute w-full -top-px transition-all text-primary shrink-0"
      :class="wrapperClasses"
    >
      <svg
        viewBox="0 0 1440 181"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        class="pointer-events-none"
      >
        <mask
          id="path-1-inside-1_414_5526"
          fill="white"
        >
          <path d="M0 0H1440V181H0V0Z" />
        </mask>
        <path
          d="M0 0H1440V181H0V0Z"
          fill="url(#paint0_linear_414_5526)"
          fill-opacity="0.22"
        />
        <path
          d="M0 2H1440V-2H0V2Z"
          fill="url(#paint1_linear_414_5526)"
          mask="url(#path-1-inside-1_414_5526)"
        />
        <defs>
          <linearGradient
            id="paint0_linear_414_5526"
            x1="720"
            y1="0"
            x2="720"
            y2="181"
            gradientUnits="userSpaceOnUse"
          >
            <stop stop-color="currentColor" />
            <stop
              offset="1"
              stop-color="currentColor"
              stop-opacity="0"
            />
          </linearGradient>
          <linearGradient
            id="paint1_linear_414_5526"
            x1="0"
            y1="90.5"
            x2="1440"
            y2="90.5"
            gradientUnits="userSpaceOnUse"
          >
            <stop
              stop-color="currentColor"
              stop-opacity="0"
            />
            <stop
              offset="0.395"
              stop-color="currentColor"
            />
            <stop
              offset="1"
              stop-color="currentColor"
              stop-opacity="0"
            />
          </linearGradient>
        </defs>
      </svg>
    </div>
  </ClientOnly>
</template>
