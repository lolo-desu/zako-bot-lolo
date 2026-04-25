<template>
  <div class="flex h-full gap-6">
    <aside class="w-72 shrink-0">
      <UCard variant="subtle" class="flex h-full flex-col">
        <template #header>
          <div>
            <h2 class="m-0 text-sm font-semibold text-[var(--text-primary)]">
              记忆设置
            </h2>
            <p class="mt-1 text-xs text-[var(--text-secondary)]">
              配置 Mem0 长期记忆检索与回写
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
            title="记忆设置加载失败"
            :description="error.message"
          />

          <USkeleton v-else-if="pending" class="h-72 w-full" />

          <template v-else>
            <UAlert
              v-if="showEnvFallbackNote"
              color="warning"
              variant="subtle"
              icon="i-heroicons-exclamation-triangle-20-solid"
              title="当前仍使用环境变量默认值"
              description="首次保存后将改为使用数据库中的 Memory 设置。"
            />

            <section v-if="activeSection === 'general'" class="space-y-4">
              <UFormField
                label="启用长期记忆"
                name="enabled"
                description="开启后会在回复前检索相关记忆，并在回复完成后异步提炼长期信息。"
              >
                <div class="flex h-10 items-center">
                  <USwitch v-model="form.enabled" :disabled="saving" />
                </div>
              </UFormField>

              <UFormField
                label="Provider"
                name="provider"
                description="首版固定为 Mem0。"
              >
                <UInput v-model="form.provider" class="w-full" disabled />
              </UFormField>

              <UFormField
                label="API Base URL"
                name="baseUrl"
                description="默认使用 Mem0 Cloud；如果你自建兼容 API，也可以改成自己的地址。"
              >
                <UInput
                  v-model="form.baseUrl"
                  class="w-full"
                  placeholder="https://api.mem0.ai"
                  :disabled="saving"
                />
              </UFormField>

              <UFormField
                label="API Key"
                name="apiKey"
                description="启用记忆前必须填写。当前设置会保存在数据库 app_settings 中。"
              >
                <UInput
                  v-model="form.apiKey"
                  class="w-full"
                  :type="showApiKey ? 'text' : 'password'"
                  placeholder="m0-..."
                  :disabled="saving"
                >
                  <template #trailing>
                    <UButton
                      :icon="showApiKey ? 'i-heroicons-eye-slash-20-solid' : 'i-heroicons-eye-20-solid'"
                      size="xs"
                      variant="ghost"
                      color="neutral"
                      class="mr-1"
                      :aria-label="showApiKey ? '隐藏 API Key' : '显示 API Key'"
                      @click="showApiKey = !showApiKey"
                    />
                  </template>
                </UInput>
              </UFormField>

              <UFormField
                label="允许自动回写"
                name="writebackEnabled"
                description="关闭后只做检索注入，不会把新对话提炼回 Mem0。"
              >
                <div class="flex h-10 items-center">
                  <USwitch v-model="form.writebackEnabled" :disabled="saving || !form.enabled" />
                </div>
              </UFormField>
            </section>

            <section v-else class="space-y-4">
              <UFormField
                label="检索 Top K"
                name="topK"
                description="每次向 Mem0 搜索返回的候选记忆数。范围：1 – 20。"
              >
                <UInput
                  v-model.number="form.topK"
                  class="w-full"
                  type="number"
                  min="1"
                  max="20"
                  step="1"
                  :disabled="saving"
                />
              </UFormField>

              <UFormField
                label="注入记忆条数"
                name="maxMemories"
                description="从检索结果中最多注入多少条高相关记忆到 prompt。范围：1 – 20。"
              >
                <UInput
                  v-model.number="form.maxMemories"
                  class="w-full"
                  type="number"
                  min="1"
                  max="20"
                  step="1"
                  :disabled="saving"
                />
              </UFormField>

              <UFormField
                label="记忆块最大字符数"
                name="maxPromptChars"
                description="避免注入过长记忆导致上下文被挤占。范围：100 – 4000。"
              >
                <UInput
                  v-model.number="form.maxPromptChars"
                  class="w-full"
                  type="number"
                  min="100"
                  max="4000"
                  step="50"
                  :disabled="saving"
                />
              </UFormField>

              <UFormField
                label="请求超时（毫秒）"
                name="timeoutMs"
                description="Memory API 的单次请求超时。范围：1000 – 30000。"
              >
                <UInput
                  v-model.number="form.timeoutMs"
                  class="w-full"
                  type="number"
                  min="1000"
                  max="30000"
                  step="500"
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
import type { MemorySettings } from '@zakobot/shared'

type MemorySection = 'general' | 'retrieval'

const toast = useToast()

const sections: Array<{
  label: string
  value: MemorySection
  icon: string
  description: string
}> = [
  {
    label: '通用设置',
    value: 'general',
    icon: 'i-heroicons-adjustments-horizontal-20-solid',
    description: '开启或关闭 Mem0 记忆，并配置访问凭据。',
  },
  {
    label: '检索参数',
    value: 'retrieval',
    icon: 'i-heroicons-funnel-20-solid',
    description: '控制检索数量、注入长度和网络超时。',
  },
]

const { data, pending, error, refresh } = await useFetch<{ ok: true, data: MemorySettings }>('/api/settings/memory')

const activeSection = ref<MemorySection>('general')
const activeSectionMeta = computed(() =>
  sections.find(item => item.value === activeSection.value) ?? sections[0],
)

const form = reactive<MemorySettings>({
  enabled: false,
  provider: 'mem0',
  apiKey: '',
  baseUrl: 'https://api.mem0.ai',
  topK: 5,
  maxMemories: 5,
  maxPromptChars: 600,
  timeoutMs: 8000,
  writebackEnabled: true,
})
const saving = ref(false)
const showApiKey = ref(false)

watch(
  () => data.value?.data,
  (settings) => {
    if (!settings) {
      return
    }

    form.enabled = settings.enabled
    form.provider = 'mem0'
    form.apiKey = settings.apiKey
    form.baseUrl = settings.baseUrl
    form.topK = settings.topK
    form.maxMemories = settings.maxMemories
    form.maxPromptChars = settings.maxPromptChars
    form.timeoutMs = settings.timeoutMs
    form.writebackEnabled = settings.writebackEnabled
  },
  { immediate: true },
)

const showEnvFallbackNote = computed(() => !form.enabled && !form.apiKey.trim())

const canSave = computed(() => {
  if (form.enabled && !form.apiKey.trim()) {
    return false
  }

  return Number.isInteger(Number(form.topK))
    && Number(form.topK) >= 1
    && Number(form.topK) <= 20
    && Number.isInteger(Number(form.maxMemories))
    && Number(form.maxMemories) >= 1
    && Number(form.maxMemories) <= 20
    && Number.isInteger(Number(form.maxPromptChars))
    && Number(form.maxPromptChars) >= 100
    && Number(form.maxPromptChars) <= 4000
    && Number.isInteger(Number(form.timeoutMs))
    && Number(form.timeoutMs) >= 1000
    && Number(form.timeoutMs) <= 30000
    && form.baseUrl.trim().length > 0
  })

async function handleSave() {
  if (!canSave.value) {
    return
  }

  saving.value = true

  try {
    const updated = await $fetch<{ ok: true, data: MemorySettings }>('/api/settings/memory', {
      method: 'PUT',
      body: {
        enabled: form.enabled,
        provider: 'mem0',
        apiKey: form.apiKey.trim(),
        baseUrl: form.baseUrl.trim(),
        topK: Number(form.topK),
        maxMemories: Number(form.maxMemories),
        maxPromptChars: Number(form.maxPromptChars),
        timeoutMs: Number(form.timeoutMs),
        writebackEnabled: form.writebackEnabled,
      },
    })

    data.value = updated
    toast.add({ title: '已保存记忆设置', color: 'success' })
    await refresh()
  }
  catch (err: any) {
    toast.add({
      title: err?.data?.message ?? err?.message ?? '保存记忆设置失败',
      color: 'error',
    })
  }
  finally {
    saving.value = false
  }
}
</script>
