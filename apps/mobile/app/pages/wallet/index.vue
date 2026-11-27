<script setup lang="ts">
// The Wallet tab: the user's Frigear ID (a QR code that renews itself) and event tickets, and for crew and staff the
// scanner (Frigear IDs, tickets at the door, shift passes), shown when they may use at least one of its modes. The
// navbar's large title is the tab's label.
const { t } = useI18n()
const localePath = useLocalePath()
// What the user may do decides the Scan button: known before the page shows, so it does not pop in.
await useAuthorization().ensure()
const { canScan } = useScanModes()

// Kept alive between tab switches: the tickets load again on the way back (the Frigear ID renews on its own).
onTabEnter(() => refreshNuxtData('wallet-tickets'))
</script>

<template>
  <div class="flex flex-col gap-4">
    <UButton
      v-if="canScan"
      :to="localePath('/wallet/scan')"
      :label="t('app.wallet.scan.open')"
      icon="i-lucide-scan-line"
      size="xl"
      block
      data-wallet-scan
    />
    <WalletFrigearIdCard />
    <WalletTickets />
  </div>
</template>
