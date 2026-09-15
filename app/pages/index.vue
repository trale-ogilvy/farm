<script setup lang="ts">
useHead({ title: 'Nông trại' })
</script>

<template>
  <main class="relative h-dvh w-screen overflow-hidden text-ink">
    <GameCanvas />

    <!-- Hai lớp giấy nằm GIỮA cảnh 3D và HUD: chúng làm mềm khung hình game
         nhưng không được phủ lên chữ, nếu không chữ sẽ mờ và khó đọc. -->
    <div class="paper-grain" />
    <div class="paper-vignette" />

    <HudActionPrompt />
    <HudStatusBar />
    <HudSideButtons />
    <HudHotbar />
    <HudBackpack />
    <HudSeedPicker />
    <HudPetPanel />
    <HudShopPanel />
    <HudToasts />
    <HudHelpOverlay />
  </main>
</template>
