<script setup lang="ts">
useHead({ title: 'Nông trại · 2.5D' })
</script>

<template>
  <main class="relative h-dvh w-screen overflow-hidden text-farm-parchment">
    <GameCanvas />
    <HudStatusBar />
    <HudSideButtons />
    <HudHotbar />
    <HudPetPanel />
    <HudShopPanel />
    <HudToasts />
    <HudHelpOverlay />
  </main>
</template>
