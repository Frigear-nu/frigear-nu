<script setup lang="ts">
import { computed, ref } from 'vue'

// The front page's install command, one tab per starter (like the package manager tabs on nuxt.com), with a link to
// that starter's guide under it. Keep in step with `STARTERS` in packages/cli/src/commands/init.ts.

interface StarterTab {
  label: string
  icon: string
  platform: string
  to: string
  guide: string
}

const starters: StarterTab[] = [
  { label: 'Web', icon: 'i-lucide-globe', platform: 'web', to: '/examples/starters/workspace', guide: 'Workspace' },
  { label: 'Mobile', icon: 'i-lucide-smartphone', platform: 'mobile', to: '/examples/starters/mobile', guide: 'Mobile' },
  { label: 'Desktop', icon: 'i-lucide-monitor', platform: 'desktop', to: '/examples/starters/desktop', guide: 'Desktop' },
  { label: 'Web + mobile', icon: 'i-lucide-tablet-smartphone', platform: 'web,mobile', to: '/examples/starters/mobile-standalone', guide: 'Mobile standalone' },
  { label: 'All', icon: 'i-lucide-layers', platform: 'web,mobile,desktop', to: '/examples/starters/multi-platform', guide: 'Multi-platform' },
]

const tab = ref('0')
const current = computed(() => starters[Number(tab.value)] ?? starters[0]!)
const command = (starter: StarterTab) => `pnpm create frigear-app my-app --platform ${starter.platform} && cd my-app`
</script>

<template>
  <div class="flex flex-col gap-3">
    <!-- On phones the icons go and the list leaves room for the copy button, so all five tabs stay readable. -->
    <ProseCodeGroup
      v-model="tab"
      sync="frigear-starter"
      class="my-0"
      :ui="{ list: 'pe-12', triggerIcon: 'hidden sm:inline-flex' }"
    >
      <ProsePre
        v-for="starter in starters"
        :key="starter.platform"
        :filename="starter.label"
        :icon="starter.icon"
        :code="command(starter)"
        language="bash"
      >
        <code><span class="text-primary">pnpm</span> create frigear-app my-app --platform {{ starter.platform }} &amp;&amp; <span class="text-primary">cd</span> my-app</code>
      </ProsePre>
    </ProseCodeGroup>

    <ULink :to="current.to" class="inline-flex items-center gap-1 self-start text-sm font-medium text-primary hover:underline">
      Continue with the {{ current.guide }} starter guide
      <UIcon name="i-lucide-arrow-right" class="size-4" />
    </ULink>
  </div>
</template>
