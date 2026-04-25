<template>
  <div class="flex h-[calc(100vh-4rem)] flex-col gap-4">
    <UCard variant="subtle">
      <template #header>
        <div class="px-1">
          <h1 class="m-0 text-xl font-bold text-[var(--text-primary)]">
            设置
          </h1>
        </div>
      </template>

      <UTabs
        :items="settingItems"
        :model-value="activeTab"
        color="neutral"
        variant="link"
        class="w-full"
        :ui="{
          list: 'w-full justify-start',
          trigger: 'min-h-10 rounded-md px-3 text-sm',
          leadingIcon: 'size-4'
        }"
        @update:model-value="handleTabChange"
      />
    </UCard>

    <div class="min-h-0 flex-1 overflow-y-auto">
      <NuxtPage />
    </div>
  </div>
</template>

<script setup lang="ts">
const route = useRoute()

const settingItems = [
  {
    label: '通用设置',
    icon: 'i-heroicons-adjustments-horizontal-20-solid',
    value: 'general',
    to: '/settings/general',
    match: '/settings/general',
  },
  {
    label: '模型设置',
    icon: 'i-heroicons-cpu-chip-20-solid',
    value: 'models',
    to: '/settings/models',
    match: '/settings/models',
  },
  {
    label: '搜索设置',
    icon: 'i-heroicons-magnifying-glass-20-solid',
    value: 'search',
    to: '/settings/search',
    match: '/settings/search',
  },
  {
    label: '浏览设置',
    icon: 'i-heroicons-globe-alt-20-solid',
    value: 'browse',
    to: '/settings/browse',
    match: '/settings/browse',
  },
  {
    label: 'MCP',
    icon: 'i-heroicons-server-stack-20-solid',
    value: 'mcp',
    to: '/settings/mcp',
    match: '/settings/mcp',
  },
  {
    label: '技能',
    icon: 'i-heroicons-academic-cap-20-solid',
    value: 'skills',
    to: '/settings/skills',
    match: '/settings/skills',
  },
  {
    label: '密码设置',
    icon: 'i-heroicons-lock-closed-20-solid',
    value: 'password',
    to: '/settings/password',
    match: '/settings/password',
  },
] as const

const activeTab = computed(() =>
  settingItems.find(item => route.path.startsWith(item.match))?.value ?? settingItems[0].value,
)

async function handleTabChange(value: string | number) {
  const target = settingItems.find(item => item.value === value)

  if (target && route.path !== target.to) {
    await navigateTo(target.to)
  }
}
</script>
