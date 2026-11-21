<script setup lang="ts">
import type { ButtonProps, PageCardProps } from '@nuxt/ui'
import { objectPick } from '@vueuse/core'
import { computed, resolveComponent, useRuntimeConfig } from '#imports'

defineOptions({ name: 'FaqCard' })

// Moved from `apps/website`, with the same props and markup. Question and answer texts are Markdown; they render through
// `<MDC>` (Nuxt Content) when the app has it, and as plain text otherwise.
// The props are spelled out here (the same as `FaqCardProps` in types.ts) because Vue resolves the type of `defineProps`
// when the app compiles this file, and cannot always follow an import into a published package.
type ForwardedProps = Pick<PageCardProps, 'title' | 'description' | 'icon' | 'to' | 'spotlight' | 'variant' | 'class'>
const props = withDefaults(defineProps<ForwardedProps & {
  faqs?: {
    icon?: string
    trailingIcon?: string
    title: string
    details?: string
    lines?: string[]
    as?: string
    links?: ButtonProps[]
  }[]
  links?: ButtonProps[]
  contact?: ButtonProps & { initial?: Record<string, unknown> }
}>(), {
  spotlight: true,
  faqs: () => [],
  links: () => [],
  contact: undefined,
})

const hasMdc = typeof resolveComponent('MDC') !== 'string'
// `ProseBlockquote` comes with Nuxt Content too; a plain blockquote stands in without it.
const Blockquote = resolveComponent('ProseBlockquote')
const blockquote = typeof Blockquote === 'string' ? 'blockquote' : Blockquote

const pageCardProps = computed<PageCardProps>(() => {
  return objectPick(props, ['title', 'description', 'icon', 'to', 'spotlight', 'variant', 'class'])
})

const contactFormModalProps = computed(() => {
  if (!props.contact) return {}
  return objectPick(props.contact, ['label', 'initial'])
})

// The contact button: the host's own component (`contactComponent`, for example the website's `ContactFormModal`), else a
// built-in button that opens a form of `@frigear-nu/forms` when it is installed, else no button.
const config = useRuntimeConfig().public.faq
const contactName = config?.contactComponent || undefined
const contactComponent = contactName ? resolveComponent(contactName) : undefined
const hostContact = typeof contactComponent === 'string' ? undefined : contactComponent
const builtInContact = !contactName && !!config?.forms
</script>

<template>
  <UPageCard
    v-bind="pageCardProps"
    :ui="{ footer: 'mt-0 flex w-full' }"
  >
    <template #title>
      <slot name="title">
        <MDC
          v-if="title && hasMdc"
          :value="title"
          unwrap
        />
        <template v-else-if="title">
          {{ title }}
        </template>
      </slot>
    </template>
    <template #description>
      <slot name="description">
        <MDC
          v-if="description && hasMdc"
          :value="description"
          unwrap
        />
        <template v-else-if="description">
          {{ description }}
        </template>
      </slot>
    </template>
    <template
      v-if="$slots.footer || faqs.length || links.length || contact"
      #footer
    >
      <slot name="footer">
        <div class="flex flex-col gap-4 w-full">
          <UCollapsible
            v-for="({ title, lines, details, icon, as, links: faqLinks }, index) in faqs"
            :key="index"
            :default-open="false"
            :unmount-on-hide="false"
            class="flex flex-col gap-2 w-full mb-0"
          >
            <UButton
              block
              :icon="icon"
              class="group"
              trailing-icon="i-lucide-chevron-down"
              variant="subtle"
              color="neutral"
              :ui="{
                trailingIcon: 'group-data-[state=open]:rotate-180 transition-transform duration-200',
              }"
            >
              <MDC
                v-if="hasMdc"
                :value="title"
                unwrap
              />
              <template v-else>
                {{ title }}
              </template>
            </UButton>
            <template #content>
              <div class="flex flex-col gap-4">
                <slot :name="`faq-${as || index}-detail`">
                  <component
                    :is="blockquote"
                    v-if="details"
                  >
                    <MDC
                      v-if="hasMdc"
                      :value="details"
                      unwrap
                    />
                    <span
                      v-else
                      class="whitespace-pre-line"
                    >{{ details }}</span>
                  </component>
                </slot>
                <slot :name="`faq-${as || index}-lines`">
                  <UPageList v-if="lines">
                    <div
                      v-for="(line, lineIdx) in lines"
                      :key="lineIdx"
                    >
                      <MDC
                        v-if="hasMdc"
                        :value="line"
                        unwrap
                      />
                      <template v-else>
                        {{ line }}
                      </template>
                    </div>
                  </UPageList>
                </slot>
                <div
                  v-if="faqLinks?.length"
                  class="flex flex-wrap gap-2"
                >
                  <UButton
                    v-for="(link, linkIdx) in faqLinks"
                    :key="linkIdx"
                    variant="subtle"
                    color="neutral"
                    size="sm"
                    v-bind="link"
                  />
                </div>
              </div>
            </template>
          </UCollapsible>
          <UButton
            v-for="(link, index) in links"
            :key="index"
            v-bind="link"
            block
          />
          <template v-if="contact">
            <component
              :is="hostContact"
              v-if="hostContact"
              v-bind="contactFormModalProps"
            />
            <FaqContactButton
              v-else-if="builtInContact"
              v-bind="contactFormModalProps"
            />
          </template>
        </div>
      </slot>
    </template>
  </UPageCard>
</template>
