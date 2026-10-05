<script setup lang="ts">
import * as Sentry from '@sentry/nuxt'
import { useRoute } from '#imports'
import { computed, reactive, ref } from 'vue'

type HeroCarouselImage = {
  src: string
  alt?: string
}

type HeroCarouselFormat = | 'webp'
  | 'avif'
  | 'jpeg'
  | 'jpg'
  | 'png'
  | 'gif'
  | 'svg'

const props = withDefaults(defineProps<{
  images: HeroCarouselImage[]
  width?: number
  height?: number
  sizes?: string
  quality?: number
  format?: HeroCarouselFormat
  densities?: string
  autoplay?: boolean
  autoplayDelay?: number
  loop?: boolean
  fade?: boolean
  showArrows?: boolean
  showDots?: boolean
  overlay?: boolean
  overlayClass?: string
  ariaLabel?: string
  maxWidthClass?: string
  frameClass?: string
  surfaceClass?: string
  prevIcon?: string
  nextIcon?: string
}>(), {
  width: 1200,
  height: 1200,
  sizes: '90vw md:460px',
  quality: 82,
  format: 'webp',
  densities: 'x1 x2',
  autoplay: true,
  autoplayDelay: 3200,
  loop: true,
  fade: true,
  showArrows: false,
  showDots: true,
  overlay: true,
  overlayClass: '',
  ariaLabel: 'Frigear hero image carousel',
  maxWidthClass: 'max-w-115',
  frameClass: 'hero-carousel-frame-fancy',
  surfaceClass: 'hero-carousel-surface',
  prevIcon: 'i-lucide-chevron-left',
  nextIcon: 'i-lucide-chevron-right',
})

const normalizedImages = computed(() =>
  props.images
    .filter((image): image is HeroCarouselImage =>
      Boolean(image && typeof image.src === 'string' && image.src.trim()),
    )
    .map(image => ({
      src: image.src,
      alt: image.alt ?? '',
    })),
)

const hasMultipleSlides = computed(() => normalizedImages.value.length > 1)
const firstImageSrc = computed(() => normalizedImages.value[0]?.src ?? '')

const carouselAutoplay = computed(() => {
  if (!props.autoplay || !hasMultipleSlides.value) {
    return false
  }

  return { delay: props.autoplayDelay }
})

const carouselLoop = computed(() => props.loop && hasMultipleSlides.value)
const carouselArrows = computed(() => props.showArrows && hasMultipleSlides.value)
const carouselDots = computed(() => props.showDots && hasMultipleSlides.value)

const failedImages = ref<Record<string, boolean>>({})
const route = useRoute()

const activeImages = computed(() =>
  normalizedImages.value.filter(image => !failedImages.value[image.src]),
)

const handleImageError = (src: string) => {
  failedImages.value[src] = true
  console.warn(`Image failed to load: ${src}`)

  try {
    if (Sentry && typeof Sentry.captureException === 'function') {
      Sentry.captureException(new Error(`HeroImageCarousel image load failed: ${src}`), {
        extra: {
          src,
          page: route.fullPath,
          component: 'HeroImageCarousel',
        },
      })
    }
  }
  catch (sentryError) {
    console.warn('Sentry capture failed', sentryError)
  }
}

const stageRef = ref<HTMLElement | null>(null)

const tilt = reactive({
  rotateX: 0,
  rotateY: 0,
  auraX: 50,
  auraY: 42,
})

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function onStagePointerMove(event: PointerEvent): void {
  if (event.pointerType === 'touch') {
    return
  }

  const element = stageRef.value

  if (!element) {
    return
  }

  const rect = element.getBoundingClientRect()
  const px = (event.clientX - rect.left) / rect.width
  const py = (event.clientY - rect.top) / rect.height

  tilt.rotateY = clamp((px - 0.5) * 16, -8, 8)
  tilt.rotateX = clamp((0.5 - py) * 16, -8, 8)
  tilt.auraX = clamp(px * 100, 18, 82)
  tilt.auraY = clamp(py * 100, 18, 82)
}

function resetStageMotion(): void {
  tilt.rotateX = 0
  tilt.rotateY = 0
  tilt.auraX = 50
  tilt.auraY = 42
}

const heroStageStyle = computed<Record<string, string>>(() => ({
  '--hero-rotate-x': `${tilt.rotateX}deg`,
  '--hero-rotate-y': `${tilt.rotateY}deg`,
  '--hero-aura-x': `${tilt.auraX}%`,
  '--hero-aura-y': `${tilt.auraY}%`,
}))

const prevButtonProps = {
  size: 'md',
  color: 'neutral',
  variant: 'ghost',
  class: 'hero-carousel-arrow hero-carousel-arrow-left',
} as const

const nextButtonProps = {
  size: 'md',
  color: 'neutral',
  variant: 'ghost',
  class: 'hero-carousel-arrow hero-carousel-arrow-right',
} as const

const overlayClasses = computed(() => [
  'hero-carousel-glass',
  props.overlayClass,
])

const carouselUi = {
  item: 'basis-full',
  controls: 'pointer-events-none absolute inset-0 z-20',
  prev: 'pointer-events-auto',
  next: 'pointer-events-auto',
  dots: 'absolute inset-x-0 bottom-4',
} as const
</script>

<template>
  <div
    class="mx-auto w-full md:mx-0"
    :class="maxWidthClass"
  >
    <div
      ref="stageRef"
      class="hero-carousel-stage"
      :style="heroStageStyle"
      @pointermove="onStagePointerMove"
      @pointerleave="resetStageMotion"
    >
      <div
        class="hero-carousel-aura"
        aria-hidden="true"
      />

      <div :class="frameClass">
        <UCarousel
          v-if="activeImages.length"
          v-slot="{ item }"
          :items="activeImages"
          :loop="carouselLoop"
          :dots="carouselDots"
          :arrows="carouselArrows"
          :autoplay="carouselAutoplay"
          :fade="fade"
          :prev="prevButtonProps"
          :next="nextButtonProps"
          :prev-icon="prevIcon"
          :next-icon="nextIcon"
          :ui="carouselUi"
          class="relative w-full"
          :aria-label="ariaLabel"
        >
          <div :class="surfaceClass">
            <NuxtImg
              :src="item.src"
              :alt="item.alt"
              :width="width"
              :height="height"
              :format="format"
              :densities="densities"
              :quality="quality"
              :sizes="sizes"
              :loading="item.src === firstImageSrc ? 'eager' : 'lazy'"
              class="hero-carousel-media"
              @error="handleImageError(item.src)"
            />

            <div
              v-if="overlay"
              class="pointer-events-none absolute inset-0"
              :class="overlayClasses"
            />
          </div>
        </UCarousel>
      </div>
    </div>
  </div>
</template>

<style lang="postcss">
@reference "../../assets/css/main.css";

.hero-carousel-stage {
  --hero-rotate-x: 0deg;
  --hero-rotate-y: 0deg;
  --hero-aura-x: 50%;
  --hero-aura-y: 42%;

  position: relative;
  isolation: isolate;
  overflow: visible;
  perspective: 1400px;
}

.hero-carousel-aura {
  pointer-events: none;
  position: absolute;
  inset: -8%;
  z-index: -10;
  border-radius: 9999px;

  background:
    radial-gradient(
      circle at var(--hero-aura-x) var(--hero-aura-y),
      rgb(37 99 235 / 0.22) 0%,
      rgb(37 99 235 / 0.12) 16%,
      transparent 34%
    ),
    radial-gradient(
      circle at 68% 28%,
      rgb(124 58 237 / 0.18) 0%,
      transparent 24%
    ),
    radial-gradient(
      circle at 44% 66%,
      rgb(20 184 166 / 0.12) 0%,
      transparent 28%
    );

  filter: blur(42px) saturate(1.15);
  opacity: 0.95;
  animation: hero-aura-float 10s ease-in-out infinite alternate;

  @variant dark {
    background:
      radial-gradient(
        circle at var(--hero-aura-x) var(--hero-aura-y),
        rgb(59 130 246 / 0.28) 0%,
        rgb(59 130 246 / 0.16) 16%,
        transparent 34%
      ),
      radial-gradient(
        circle at 68% 28%,
        rgb(147 51 234 / 0.22) 0%,
        transparent 24%
      ),
      radial-gradient(
        circle at 44% 66%,
        rgb(6 182 212 / 0.14) 0%,
        transparent 28%
      );
  }
}

.hero-carousel-frame-fancy {
  /* Gradient stop colors — change these to retheme the frame and arrows together */
  --hcf-blue:   37 99 235;
  --hcf-purple: 124 58 237;
  --hcf-teal:   20 184 166;

  position: relative;
  isolation: isolate;
  border-radius: 9999px;
  padding: 0.875rem; /* p-3.5 */

  @media (min-width: 640px) {
    padding: 0.9375rem; /* sm:p-3.75 */
  }

  transform-style: preserve-3d;
  transform:
    rotateX(var(--hero-rotate-x))
    rotateY(var(--hero-rotate-y))
    translateZ(0);

  transition:
    transform 180ms ease-out,
    box-shadow 220ms ease-out;

  background:
    /* Shine highlight (was ::before — freed up for inner border ring) */
    linear-gradient(
      145deg,
      rgb(255 255 255 / 0.22) 0%,
      rgb(255 255 255 / 0.08) 14%,
      transparent 32%,
      transparent 100%
    ),
    conic-gradient(
      from 215deg at 50% 50%,
      rgb(var(--hcf-blue)   / 0.90) 0deg,
      rgb(var(--hcf-purple) / 0.86) 120deg,
      rgb(var(--hcf-teal)   / 0.58) 230deg,
      rgb(var(--hcf-blue)   / 0.90) 360deg
    );

  box-shadow:
    0 28px 60px -24px rgb(7 15 40 / 0.62),
    0 10px 28px rgb(10 20 40 / 0.32),
    inset 0 1px 0 rgb(255 255 255 / 0.14),
    /* directional glows echoing the arrow button colours */
    -8px 0 22px -5px rgb(var(--hcf-purple) / 0.50),
     8px 0 22px -5px rgb(var(--hcf-teal)   / 0.40);

  @variant dark {
    box-shadow:
      0 34px 70px -26px rgb(2 6 23 / 0.78),
      0 14px 32px rgb(2 6 23 / 0.42),
      inset 0 1px 0 rgb(255 255 255 / 0.12),
      -8px 0 26px -5px rgb(var(--hcf-purple) / 0.60),
       8px 0 26px -5px rgb(var(--hcf-teal)   / 0.50);
  }
}

/* Inner gradient border ring — at the inner edge of the frame, on top of the image edge */
.hero-carousel-frame-fancy::before {
  content: "";
  pointer-events: none;
  position: absolute;
  border-radius: 9999px;

  /* inset matches p-3.5 = 0.875rem; at sm+ p-3.75 the 1px diff is negligible */
  inset: 0.875rem;
  z-index: 20;

  background: conic-gradient(
    from 270deg at 50% 50%,
    rgb(var(--hcf-purple) / 0.90) 0deg,
    rgb(var(--hcf-blue)   / 0.60) 90deg,
    rgb(var(--hcf-teal)   / 0.90) 180deg,
    rgb(var(--hcf-blue)   / 0.60) 270deg,
    rgb(var(--hcf-purple) / 0.90) 360deg
  );

  /* Trim to a 2px ring at the outer (= inner-frame) edge */
  -webkit-mask: radial-gradient(farthest-side, transparent calc(100% - 2px), black calc(100% - 2px));
          mask: radial-gradient(farthest-side, transparent calc(100% - 2px), black calc(100% - 2px));
}

/* Outer gradient border ring — sits just outside the frame */
.hero-carousel-frame-fancy::after {
  content: "";
  pointer-events: none;
  position: absolute;
  border-radius: 9999px;

  inset: -2px;
  z-index: -1;

  background: conic-gradient(
    from 270deg at 50% 50%,
    rgb(var(--hcf-purple) / 0.85) 0deg,
    rgb(var(--hcf-blue)   / 0.55) 90deg,
    rgb(var(--hcf-teal)   / 0.85) 180deg,
    rgb(var(--hcf-blue)   / 0.55) 270deg,
    rgb(var(--hcf-purple) / 0.85) 360deg
  );

  /* Trim to a 2px ring at the outer edge */
  -webkit-mask: radial-gradient(farthest-side, transparent calc(100% - 2px), black calc(100% - 2px));
          mask: radial-gradient(farthest-side, transparent calc(100% - 2px), black calc(100% - 2px));
}

.hero-carousel-surface {
  position: relative;
  overflow: hidden;
  border-radius: 9999px;
  backdrop-filter: blur(18px) saturate(1.18);
  background:
    linear-gradient(
      180deg,
      rgb(255 255 255 / 0.14) 0%,
      rgb(255 255 255 / 0.04) 16%,
      rgb(15 23 42 / 0.04) 56%,
      rgb(2 6 23 / 0.14) 100%
    ),
    radial-gradient(
      circle at 50% 34%,
      rgb(255 255 255 / 0.08) 0%,
      transparent 58%
    );

  box-shadow:
    inset 0 1px 0 rgb(255 255 255 / 0.22),
    inset 0 -20px 40px rgb(3 7 18 / 0.18);

  @variant dark {
    background:
      linear-gradient(
        180deg,
        rgb(255 255 255 / 0.10) 0%,
        rgb(255 255 255 / 0.03) 16%,
        rgb(2 6 23 / 0.08) 56%,
        rgb(2 6 23 / 0.16) 100%
      ),
      radial-gradient(
        circle at 50% 34%,
        rgb(255 255 255 / 0.06) 0%,
        transparent 58%
      );

    box-shadow:
      inset 0 1px 0 rgb(255 255 255 / 0.16),
      inset 0 -24px 44px rgb(2 6 23 / 0.24);
  }
}

.hero-carousel-surface::before {
  content: "";
  pointer-events: none;
  position: absolute;
  inset: 0;
  border-radius: 9999px;

  background:
    linear-gradient(
      180deg,
      rgb(255 255 255 / 0.26) 0%,
      rgb(255 255 255 / 0.10) 14%,
      transparent 28%,
      transparent 100%
    );

  mix-blend-mode: screen;
  opacity: 0.82;
}

.hero-carousel-surface::after {
  content: "";
  pointer-events: none;
  position: absolute;
  inset: 0;
  border-radius: 9999px;

  background:
    radial-gradient(
      circle at 28% 20%,
      rgb(255 255 255 / 0.16) 0%,
      transparent 18%
    ),
    radial-gradient(
      circle at 72% 78%,
      rgb(255 255 255 / 0.06) 0%,
      transparent 22%
    );

  opacity: 0.7;
}

.hero-carousel-glass {
  pointer-events: none;
  position: absolute;
  inset: 0;
  border-radius: 9999px;
  background:
    radial-gradient(
      circle at 26% 18%,
      rgb(255 255 255 / 0.16) 0%,
      rgb(255 255 255 / 0.06) 12%,
      transparent 36%
    ),
    linear-gradient(
      180deg,
      rgb(255 255 255 / 0.10) 0%,
      transparent 26%,
      transparent 72%,
      rgb(2 6 23 / 0.10) 100%
    );
  mix-blend-mode: screen;
}

.hero-carousel-media {
  display: block;
  aspect-ratio: 1 / 1;
  width: 100%;
  object-fit: cover;
  border-radius: 9999px;
  transform: scale(1.015);
  will-change: transform;
}

.hero-carousel-arrow {
  position: absolute;
  top: 50%;
  z-index: 30;
  display: grid;
  width: 2.5rem;
  height: 2.5rem;
  translate: 0 -50%;
  place-items: center;
  border-radius: 9999px;
  border-width: 1px;
  border-style: solid;

  @media (min-width: 640px) {
    width: 2.75rem;
    height: 2.75rem;
  }

  border-color: rgb(255 255 255 / 0.14);
  background:
    linear-gradient(
      180deg,
      rgb(255 255 255 / 0.12) 0%,
      rgb(255 255 255 / 0.04) 100%
    );
  backdrop-filter: blur(16px) saturate(1.2);
  box-shadow:
    0 8px 24px rgb(2 6 23 / 0.28),
    inset 0 1px 0 rgb(255 255 255 / 0.10);
  transition:
    transform 160ms ease,
    background-color 160ms ease,
    border-color 160ms ease,
    box-shadow 160ms ease;

  @variant dark {
    border-color: rgb(255 255 255 / 0.12);
    background:
      linear-gradient(
        180deg,
        rgb(255 255 255 / 0.10) 0%,
        rgb(255 255 255 / 0.03) 100%
      );
  }
}

.hero-carousel-arrow-left {
  /* Icon colour: purple; button border: purple; icon glow: teal (opposite) */
  color: rgb(var(--hcf-purple, 124 58 237));
  left: -0.45rem;
  justify-content: center;
  border: 1.5px solid rgb(var(--hcf-purple, 124 58 237) / 0.70);
  background:
    linear-gradient(
      180deg,
      rgb(15 23 42 / 0.82) 0%,
      rgb(2 6 23 / 0.90) 100%
    ),
    radial-gradient(
      circle at 50% 50%,
      rgb(var(--hcf-purple, 124 58 237) / 0.18) 0%,
      transparent 60%
    );

  /* Glowing border rings — inner tight halo + outer bloom */
  box-shadow:
    0 0 0 1px rgb(var(--hcf-purple, 124 58 237) / 0.55),
    0 0 8px 1px rgb(var(--hcf-purple, 124 58 237) / 0.35),
    0 8px 24px rgb(2 6 23 / 0.28),
    inset 0 1px 0 rgb(255 255 255 / 0.10);
}

.hero-carousel-arrow-left svg,
.hero-carousel-arrow-left [class*="i-"] {
  /* Teal halo — opposite of purple border */
  filter: drop-shadow(0 0 4px rgb(var(--hcf-teal, 20 184 166) / 0.90));
}

.hero-carousel-arrow-right {
  /* Icon colour: teal; button border: teal; icon glow: purple (opposite) */
  color: rgb(var(--hcf-teal, 20 184 166));

  right: -0.45rem;
  justify-content: center;
  border: 1.5px solid rgb(var(--hcf-teal, 20 184 166) / 0.70);
  background:
    linear-gradient(
      180deg,
      rgb(15 23 42 / 0.82) 0%,
      rgb(2 6 23 / 0.90) 100%
    ),
    radial-gradient(
      circle at 50% 50%,
      rgb(var(--hcf-teal, 20 184 166) / 0.18) 0%,
      transparent 60%
    );

  /* Glowing border rings — inner tight halo + outer bloom */
  box-shadow:
    0 0 0 1px rgb(var(--hcf-teal, 20 184 166) / 0.55),
    0 0 8px 1px rgb(var(--hcf-teal, 20 184 166) / 0.35),
    0 8px 24px rgb(2 6 23 / 0.28),
    inset 0 1px 0 rgb(255 255 255 / 0.10);
}

.hero-carousel-arrow-right svg,
.hero-carousel-arrow-right [class*="i-"] {
  /* Purple halo — opposite of teal border */
  filter: drop-shadow(0 0 4px rgb(var(--hcf-purple, 124 58 237) / 0.90));
}

@media (min-width: 640px) {
  .hero-carousel-arrow-left {
    left: -1.9rem;
  }

  .hero-carousel-arrow-right {
    right: -1.9rem;
  }
}

/* Enlarge the chevron icon without touching the button circle */
.hero-carousel-arrow svg,
.hero-carousel-arrow [class*="i-"] {
  width: 1.75rem;
  height: 1.75rem;
  flex-shrink: 0;
}

.hero-carousel-arrow-left:hover {
  transform: scale(1.15) translateX(-1px);
  box-shadow:
    0 0 0 1px rgb(var(--hcf-purple, 124 58 237) / 0.80),
    0 0 14px 3px rgb(var(--hcf-purple, 124 58 237) / 0.55),
    0 0 28px 6px rgb(var(--hcf-purple, 124 58 237) / 0.25),
    0 12px 28px rgb(2 6 23 / 0.34),
    inset 0 1px 0 rgb(255 255 255 / 0.14);
}

.hero-carousel-arrow-right:hover {
  transform: scale(1.15) translateX(1px);
  box-shadow:
    0 0 0 1px rgb(var(--hcf-teal, 20 184 166) / 0.80),
    0 0 14px 3px rgb(var(--hcf-teal, 20 184 166) / 0.55),
    0 0 28px 6px rgb(var(--hcf-teal, 20 184 166) / 0.25),
    0 12px 28px rgb(2 6 23 / 0.34),
    inset 0 1px 0 rgb(255 255 255 / 0.14);
}

.hero-carousel-arrow:focus-visible {
  outline: none;
  box-shadow:
    0 0 0 2px rgba(91, 12, 99, 0.356),
    0 0 0 6px rgba(25, 88, 190, 0.329),
    0 12px 28px rgba(49, 4, 51, 0.432);
}

@keyframes hero-aura-float {
  0% {
    transform: translate3d(-2.5%, -1%, 0) scale(1.02);
  }
  100% {
    transform: translate3d(2.5%, 1%, 0) scale(1.08);
  }
}

@media (prefers-reduced-motion: reduce) {
  .hero-carousel-aura,
  .hero-carousel-frame-fancy,
  .hero-carousel-arrow {
    animation: none;
    transition: none;
  }

  .hero-carousel-frame-fancy {
    transform: none;
  }
}
</style>
