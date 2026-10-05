<script setup lang="ts">
import type { PageCardProps } from '@nuxt/ui'
import { objectPick } from '@vueuse/core'
import type { FaqCardProps } from '~/types/faq'

const props = withDefaults(defineProps<FaqCardProps>(), {
  spotlight: true,
  faqs: () => [],
  links: () => [],
  contact: undefined,
})

const pageCardProps = computed<PageCardProps>(() => {
  return objectPick(props, ['title', 'description', 'icon', 'to', 'spotlight', 'variant', 'class'])
})

const contactFormModalProps = computed(() => {
  if (!props.contact) return {}
  return objectPick(props.contact, ['label', 'initial'])
})
</script>

<template>
  <UPageCard
    v-bind="pageCardProps"
    :ui="{ footer: 'flex w-full' }"
  >
    <template #title>
      <slot name="title">
        <MDC
          v-if="title"
          :value="title"
          unwrap
        />
      </slot>
    </template>
    <template #description>
      <slot name="description">
        <MDC
          v-if="description"
          :value="description"
          unwrap
        />
      </slot>
    </template>
    <template
      v-if="$slots.footer || faqs.length || links.length || contact"
      #footer
    >
      <slot name="footer">
        <div class="flex flex-col gap-4 w-full">
          <UCollapsible
            v-for="({ title, lines, details, icon, as }, index) in faqs"
            :key="index"
            :default-open="false"
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
                :value="title"
                unwrap
              />
            </UButton>
            <template #content>
              <div class="flex flex-col gap-4">
                <slot :name="`faq-${as || index}-detail`">
                  <ProseBlockquote v-if="details">
                    <MDC
                      :value="details"
                      unwrap
                    />
                  </ProseBlockquote>
                </slot>
                <slot :name="`faq-${as || index}-lines`">
                  <UPageList v-if="lines">
                    <div
                      v-for="(line, lineIdx) in lines"
                      :key="lineIdx"
                    >
                      <MDC
                        :value="line"
                        unwrap
                      />
                    </div>
                  </UPageList>
                </slot>
              </div>
            </template>
          </UCollapsible>
          <UButton
            v-for="(link, index) in links"
            :key="index"
            v-bind="link"
            block
          />
          <ContactFormModal
            v-if="contact"
            v-bind="contactFormModalProps"
          />
        </div>
      </slot>
    </template>
  </UPageCard>
</template>
