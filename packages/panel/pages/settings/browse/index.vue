<template>
  <div class="flex h-full gap-6">
    <aside class="w-72 shrink-0">
      <UCard variant="subtle" class="flex h-full flex-col">
        <template #header>
          <div>
            <h2 class="m-0 text-sm font-semibold text-[var(--text-primary)]">
              浏览设置
            </h2>
            <p class="mt-1 text-xs text-[var(--text-secondary)]">
              配置网页正文读取方式
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
            title="浏览设置加载失败"
            :description="error.message"
          />

          <USkeleton v-else-if="pending" class="h-64 w-full" />

          <template v-else>
            <section v-if="activeSection === 'general'" class="space-y-4">
              <UFormField
                label="浏览方式"
                name="provider"
                description="Fetch 使用本地静态请求；Jina.ai 通过 Reader 服务返回网页正文。"
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
                name="jinaApiKey"
                description="选择 Jina.ai 浏览方式时需要填写。"
              >
                <UInput
                  v-model="form.jinaApiKey"
                  class="w-full"
                  :type="showJinaApiKey ? 'text' : 'password'"
                  placeholder="jina_..."
                  :disabled="saving"
                >
                  <template #trailing>
                    <UButton
                      :icon="showJinaApiKey ? 'i-heroicons-eye-slash-20-solid' : 'i-heroicons-eye-20-solid'"
                      size="xs"
                      variant="ghost"
                      color="neutral"
                      class="mr-1"
                      :aria-label="showJinaApiKey ? '隐藏 Jina.ai API Key' : '显示 Jina.ai API Key'"
                      @click="showJinaApiKey = !showJinaApiKey"
                    />
                  </template>
                </UInput>
              </UFormField>

              <UFormField
                label="引擎"
                name="jinaEngine"
                description="browser 适合动态页面；direct 适合静态页面；cf-browser-rendering 适合 Cloudflare Browser Rendering。"
              >
                <USelect
                  v-model="form.jinaEngine"
                  class="w-full"
                  :items="engineOptions"
                  :disabled="saving"
                />
              </UFormField>

              <UFormField
                label="开启图片"
                name="retainImagesEnabled"
                description="关闭后请求会使用 none，不保留图片。"
              >
                <div class="flex h-10 items-center">
                  <USwitch v-model="retainImagesEnabled" :disabled="saving" />
                </div>
              </UFormField>

              <UFormField
                v-if="retainImagesEnabled"
                label="图片模式"
                name="jinaRetainImages"
              >
                <USelect
                  v-model="form.jinaRetainImages"
                  class="w-full"
                  :items="retainImagesOptions"
                  :disabled="saving"
                />
              </UFormField>

              <UFormField
                label="限制大小"
                name="jinaTokenBudgetEnabled"
                description="开启后会向 Jina.ai 发送 X-Token-Budget。"
              >
                <div class="flex h-10 items-center">
                  <USwitch v-model="form.jinaTokenBudgetEnabled" :disabled="saving" />
                </div>
              </UFormField>

              <UFormField
                v-if="form.jinaTokenBudgetEnabled"
                label="Token Budget"
                name="jinaTokenBudget"
                description="如果网页结果超过该预算，Jina.ai 会拒绝请求。"
              >
                <UInput
                  v-model.number="form.jinaTokenBudget"
                  class="w-full"
                  type="number"
                  min="1000"
                  max="1000000"
                  step="1000"
                  :disabled="saving"
                />
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
import type {
  BrowseProvider,
  BrowseSettings,
  JinaEngine,
  JinaRetainImages,
} from '@zakobot/shared'

type BrowseSection = 'general' | 'jina'

const toast = useToast()

const sections: Array<{
  label: string
  value: BrowseSection
  icon: string
  description: string
}> = [
  {
    label: '通用设置',
    value: 'general',
    icon: 'i-heroicons-adjustments-horizontal-20-solid',
    description: '选择网页浏览时使用的读取方式。',
  },
  {
    label: 'Jina.ai',
    value: 'jina',
    icon: 'i-heroicons-globe-alt-20-solid',
    description: '配置 Jina.ai Reader 请求参数。',
  },
]

const providerOptions: Array<{ label: string, value: BrowseProvider }> = [
  { label: 'Fetch', value: 'fetch' },
  { label: 'Jina.ai', value: 'jina' },
]

const engineOptions: Array<{ label: string, value: JinaEngine }> = [
  { label: 'browser', value: 'browser' },
  { label: 'direct', value: 'direct' },
  { label: 'cf-browser-rendering', value: 'cf-browser-rendering' },
]

const retainImagesOptions: Array<{ label: string, value: JinaRetainImages }> = [
  { label: 'all', value: 'all' },
  { label: 'alt', value: 'alt' },
  { label: 'all_p', value: 'all_p' },
  { label: 'alt_p', value: 'alt_p' },
]

const { data, pending, error, refresh } = await useFetch<{ ok: true, data: BrowseSettings }>('/api/settings/browse')

const activeSection = ref<BrowseSection>('general')
const activeSectionMeta = computed(() =>
  sections.find(item => item.value === activeSection.value) ?? sections[0]!,
)

const form = reactive<BrowseSettings>({
  provider: 'fetch',
  jinaApiKey: '',
  jinaEngine: 'browser',
  jinaRetainImages: 'none',
  jinaTokenBudgetEnabled: false,
  jinaTokenBudget: 200_000,
})
const saving = ref(false)
const showJinaApiKey = ref(false)

const retainImagesEnabled = computed({
  get: () => form.jinaRetainImages !== 'none',
  set: (enabled: boolean) => {
    form.jinaRetainImages = enabled ? 'all' : 'none'
  },
})

watch(
  () => data.value?.data,
  (settings) => {
    if (!settings) {
      return
    }

    form.provider = settings.provider
    form.jinaApiKey = settings.jinaApiKey
    form.jinaEngine = settings.jinaEngine
    form.jinaRetainImages = settings.jinaRetainImages
    form.jinaTokenBudgetEnabled = settings.jinaTokenBudgetEnabled
    form.jinaTokenBudget = settings.jinaTokenBudget
  },
  { immediate: true },
)

const canSave = computed(() =>
  (form.provider !== 'jina' || form.jinaApiKey.trim().length > 0)
  && (
    !form.jinaTokenBudgetEnabled
    || (
      Number.isFinite(Number(form.jinaTokenBudget))
      && Number(form.jinaTokenBudget) >= 1_000
      && Number(form.jinaTokenBudget) <= 1_000_000
    )
  ),
)

async function handleSave() {
  if (!canSave.value) {
    return
  }

  saving.value = true

  try {
    const updated = await $fetch<{ ok: true, data: BrowseSettings }>('/api/settings/browse', {
      method: 'PUT',
      body: {
        provider: form.provider,
        jinaApiKey: form.jinaApiKey.trim(),
        jinaEngine: form.jinaEngine,
        jinaRetainImages: form.jinaRetainImages,
        jinaTokenBudgetEnabled: form.jinaTokenBudgetEnabled,
        jinaTokenBudget: Number(form.jinaTokenBudget),
      },
    })

    data.value = updated
    toast.add({ title: '已保存浏览设置', color: 'success' })
    await refresh()
  }
  catch (error: any) {
    toast.add({
      title: error?.data?.message ?? error?.message ?? '保存浏览设置失败',
      color: 'error',
    })
  }
  finally {
    saving.value = false
  }
}
</script>
