<template>
  <div class="flex h-full gap-6">
    <aside class="w-72 shrink-0">
      <UCard variant="subtle" class="flex h-full flex-col">
        <template #header>
          <div>
            <h2 class="m-0 text-sm font-semibold text-[var(--text-primary)]">
              搜索设置
            </h2>
            <p class="mt-1 text-xs text-[var(--text-secondary)]">
              配置网页搜索渠道
            </p>
          </div>
        </template>

        <div class="flex min-h-0 flex-1 flex-col gap-2">
          <UButton
            v-for="item in sections"
            :key="item.value"
            color="neutral"
            :variant="activeSection === item.value ? 'soft' : 'ghost'"
            class="w-full justify-start px-3 py-2"
            :icon="item.icon"
            :label="item.label"
            @click="activeSection = item.value"
          />
        </div>
      </UCard>
    </aside>

    <div class="min-w-0 flex-1 overflow-y-auto">
      <UCard variant="subtle">
        <template #header>
          <div>
            <h3 class="m-0 text-xl font-bold text-[var(--text-primary)]">
              {{ activeSectionMeta.label }}
            </h3>
            <p class="mt-1 text-sm text-[var(--text-secondary)]">
              {{ activeSectionMeta.description }}
            </p>
          </div>
        </template>

        <div class="flex max-w-xl flex-col gap-6">
          <UAlert
            v-if="error"
            color="error"
            variant="subtle"
            icon="i-heroicons-x-circle-20-solid"
            title="搜索设置加载失败"
            :description="error.message"
          />

          <USkeleton v-else-if="pending" class="h-64 w-full" />

          <template v-else>
            <section v-if="activeSection === 'general'" class="space-y-4">
              <UFormField
                label="搜索渠道"
                name="provider"
                description="Tavily 更适合 AI 搜索；Google 网页搜索无需密钥，但可能受到页面结构和访问限制影响。"
              >
                <USelect
                  v-model="form.provider"
                  class="w-full"
                  :items="providerOptions"
                  :disabled="saving"
                />
              </UFormField>
            </section>

            <section v-else class="space-y-4">
              <UFormField
                label="API Key"
                name="tavilyApiKey"
                description="选择 Tavily 渠道时需要填写。"
              >
                <UInput
                  v-model="form.tavilyApiKey"
                  class="w-full"
                  :type="showTavilyApiKey ? 'text' : 'password'"
                  placeholder="tvly-..."
                  :disabled="saving"
                >
                  <template #trailing>
                    <UButton
                      :icon="showTavilyApiKey ? 'i-heroicons-eye-slash-20-solid' : 'i-heroicons-eye-20-solid'"
                      size="xs"
                      variant="ghost"
                      color="neutral"
                      class="mr-1"
                      :aria-label="showTavilyApiKey ? '隐藏 Tavily API Key' : '显示 Tavily API Key'"
                      @click="showTavilyApiKey = !showTavilyApiKey"
                    />
                  </template>
                </UInput>
              </UFormField>
            </section>

            <div class="flex justify-end">
              <UButton
                label="保存"
                :loading="saving"
                :disabled="!canSave"
                @click="handleSave"
              />
            </div>
          </template>
        </div>
      </UCard>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { SearchProvider, SearchSettings } from '@zakobot/shared'

type SearchSection = 'general' | 'tavily'

const toast = useToast()

const sections: Array<{
  label: string
  value: SearchSection
  icon: string
  description: string
}> = [
  {
    label: '通用设置',
    value: 'general',
    icon: 'i-heroicons-adjustments-horizontal-20-solid',
    description: '选择网页搜索时使用的渠道。',
  },
  {
    label: 'Tavily',
    value: 'tavily',
    icon: 'i-heroicons-sparkles-20-solid',
    description: '配置 Tavily 搜索请求参数。',
  },
]

const providerOptions: Array<{ label: string, value: SearchProvider }> = [
  { label: 'Tavily API', value: 'tavily' },
  { label: 'Google 网页搜索', value: 'google_web' },
]

const { data, pending, error, refresh } = await useFetch<{ ok: true, data: SearchSettings }>('/api/settings/search')

const activeSection = ref<SearchSection>('general')
const activeSectionMeta = computed(() =>
  sections.find(item => item.value === activeSection.value) ?? sections[0]!,
)

const form = reactive<SearchSettings>({
  provider: 'google_web',
  tavilyApiKey: '',
})
const saving = ref(false)
const showTavilyApiKey = ref(false)

watch(
  () => data.value?.data,
  (settings) => {
    if (!settings) {
      return
    }

    form.provider = settings.provider
    form.tavilyApiKey = settings.tavilyApiKey
  },
  { immediate: true },
)

const canSave = computed(() =>
  form.provider !== 'tavily' || form.tavilyApiKey.trim().length > 0,
)

async function handleSave() {
  if (!canSave.value) {
    return
  }

  saving.value = true

  try {
    const updated = await $fetch<{ ok: true, data: SearchSettings }>('/api/settings/search', {
      method: 'PUT',
      body: {
        provider: form.provider,
        tavilyApiKey: form.tavilyApiKey.trim(),
      },
    })

    data.value = updated
    toast.add({ title: '已保存搜索设置', color: 'success' })
    await refresh()
  }
  catch (error: any) {
    toast.add({
      title: error?.data?.message ?? error?.message ?? '保存搜索设置失败',
      color: 'error',
    })
  }
  finally {
    saving.value = false
  }
}
</script>
