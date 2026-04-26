<template>
  <div class="app-shell">
    <AppSidebar v-model:collapsed="sidebarCollapsed" />
    <main class="app-main">
      <UAlert
        v-if="session.requiresPasswordChange"
        color="warning"
        variant="subtle"
        icon="i-heroicons-shield-exclamation-20-solid"
        title="你还在使用默认密码"
        description="当前面板仍使用初始密码，请尽快前往设置修改。"
        :actions="warningActions"
        class="mb-6"
      />
      <slot />
    </main>
  </div>
</template>

<script setup lang="ts">
import type { ButtonProps } from '@nuxt/ui'

const sidebarCollapsed = ref(false)
const session = useAuthSessionState()

const warningActions = computed<ButtonProps[]>(() => [
  {
    label: '修改密码',
    color: 'warning',
    variant: 'solid',
    onClick: async () => {
      await navigateTo('/settings/password')
    },
  },
])
</script>

<style scoped>
.app-shell {
  display: flex;
  min-height: 100vh;
}

.app-main {
  flex: 1;
  padding: 2rem;
  overflow-y: auto;
}
</style>
