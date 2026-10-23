<script setup lang="ts">
import { tokens } from './theme'
import EmailFooter from './EmailFooter.vue'
import EmailHeader from './EmailHeader.vue'

withDefaults(defineProps<{
  /** Inbox preview line shown after the subject. */
  preview?: string
  lang?: string
}>(), {
  preview: undefined,
  lang: 'en',
})
</script>

<template>
  <EHtml :lang="lang">
    <EHead />
    <EPreview v-if="preview">
      {{ preview }}
    </EPreview>
    <EBody :style="{ backgroundColor: tokens.page, margin: '0', padding: '0', fontFamily: tokens.font }">
      <table
        role="presentation"
        width="100%"
        cellspacing="0"
        cellpadding="0"
        border="0"
        :style="{ backgroundColor: tokens.page }"
      >
        <tr>
          <td
            align="center"
            style="padding: 16px"
          >
            <table
              role="presentation"
              width="100%"
              cellspacing="0"
              cellpadding="0"
              border="0"
              :style="{ maxWidth: '512px', backgroundColor: tokens.card, border: `1px solid ${tokens.border}`, borderRadius: '8px', boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)' }"
            >
              <tr>
                <td style="padding: 24px; text-align: left">
                  <EmailHeader />
                  <slot />
                  <slot name="footer">
                    <EmailFooter />
                  </slot>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </EBody>
  </EHtml>
</template>
