<script setup lang="ts">
import { defineComponent, h, resolveComponent } from '#imports'

defineOptions({ name: 'HelpCenterArticleBody' })

// An article's Markdown. It renders through `<MDC>` (Nuxt Content, `@nuxtjs/mdc`) when the app has it, so MDC components
// such as `::faq{category="..."}` work inside articles, and as plain paragraphs otherwise.
//
// With `public` (the public area) the embedded FAQ components are forced to what visitors read, whoever looks: `/help`
// must be the same for everyone, and a bare `::faq` asks as the signed-in person.
const props = defineProps<{ body: string, public?: boolean }>()

// Resolves to a plain string name when the app has no MDC.
const hasMdc = typeof resolveComponent('MDC') !== 'string'

// The FAQ components, with `public` on, under every spelling MDC may look them up by. Resolved in `setup`, so a missing
// component just renders nothing.
const forcePublic = (name: string) => defineComponent({
  name: `HelpCenterPublic${name}`,
  inheritAttrs: false,
  setup(_, { attrs }) {
    const target = resolveComponent(name)
    return () => typeof target === 'string' ? null : h(target, { ...attrs, public: true })
  },
})
const components = props.public
  ? Object.fromEntries([['Faq', 'faq'], ['FaqGrid', 'faq-grid'], ['FaqSectionList', 'faq-section-list']].flatMap(([pascal, kebab]) => {
      const wrapped = forcePublic(pascal!)
      return [[pascal, wrapped], [kebab, wrapped]]
    }))
  : undefined
</script>

<template>
  <div
    class="prose prose-sm dark:prose-invert max-w-none"
    data-test="help-center-body"
  >
    <!-- `MDC` does not pass a component map on, so with one the parsed body goes to `MDCRenderer` through its slot. -->
    <MDC
      v-if="hasMdc && components"
      :value="body"
    >
      <template #default="{ body: parsed, data }">
        <MDCRenderer
          v-if="parsed"
          :body="parsed"
          :data="data"
          :components="components"
        />
      </template>
    </MDC>
    <MDC
      v-else-if="hasMdc"
      :value="body"
    />
    <p
      v-else
      class="whitespace-pre-line"
    >
      {{ body }}
    </p>
  </div>
</template>
