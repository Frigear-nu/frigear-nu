<script setup lang="ts">
import { EmailDivider, EmailHeading, EmailLayout, EmailText } from '@frigear-nu/email-templates/components'

defineProps<{
  name: string
}>()
</script>

<template>
  <EmailLayout preview="Alert: your password was changed">
    <ESubject>Your password was changed</ESubject>
    <EmailHeading tone="danger">
      Password was changed
    </EmailHeading>
    <EmailDivider />
    <EmailText>
      Hi {{ name }},
    </EmailText>
    <EmailText>
      This is a security alert. The password on your account was recently changed.
    </EmailText>
    <EmailText>
      If you made this change, no further action is required.
    </EmailText>
    <EmailDivider />
    <EmailText>
      If you did not change your password, secure your account right away by resetting it.
    </EmailText>
  </EmailLayout>
</template>
