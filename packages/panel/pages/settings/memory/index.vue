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
              配置本地长期记忆提炼与注入
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

          <USkeleton v-else-if="pending" class="h-64 w-full" />

          <template v-else>
            <section v-if="activeSection === 'general'" class="space-y-4">
              <UFormField
                label="启用本地记忆"
                name="enabled"
                description="开启后，bot 会为每个 bot + 平台 + 用户单独维护本地长期记忆，并在相关对话前注入提示。"
              >
                <div class="flex h-10 items-center">
                  <USwitch v-model="form.enabled" :disabled="saving" />
                </div>
              </UFormField>

              <UAlert
                color="neutral"
                variant="subtle"
                icon="i-heroicons-information-circle-20-solid"
                title="当前方案"
                description="记忆存储在本地 SQLite，由当前 bot 模型在回复后异步提炼；不依赖外部 memory 平台。"
              />
            </section>

            <section v-else class="space-y-4">
              <UFormField
                label="写回记忆"
                name="writebackEnabled"
                description="关闭后仅保留已有记忆检索，不再从新对话中提炼新的长期记忆。"
              >
                <div class="flex h-10 items-center">
                  <USwitch v-model="form.writebackEnabled" :disabled="saving || !form.enabled" />
                </div>
              </UFormField>

              <UFormField
                label="单次最多注入条数"
                name="maxMemories"
                description="每次请求最多放入多少条相关长期记忆。范围：1 - 20。"
              >
                <UInput
                  v-model.number="form.maxMemories"
                  class="w-full"
                  type="number"
                  min="1"
                  max="20"
                  step="1"
                  :disabled="saving || !form.enabled"
                />
              </UFormField>

              <UFormField
                label="记忆提示最大字符数"
                name="maxPromptChars"
                description="限制注入到系统提示中的 memory block 总长度。范围：100 - 4000。"
              >
                <UInput
                  v-model.number="form.maxPromptChars"
                  class="w-full"
                  type="number"
                  min="100"
                  max="4000"
                  step="50"
                  :disabled="saving || !form.enabled"
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
import type { LocalMemorySettings } from '@zakobot/shared'

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
    icon: 'i-heroicons-circle-stack-20-solid',
    description: '开启或关闭本地长期记忆能力。',
  },
  {
    label: '检索与写回',
    value: 'retrieval',
    icon: 'i-heroicons-book-open-20-solid',
    description: '控制记忆注入条数、长度以及回复后回写。',
  },
]

const { data, pending, error, refresh } = await useFetch<{ ok: true, data: LocalMemorySettings }>('/api/settings/memory')

const activeSection = ref<MemorySection>('general')
const activeSectionMeta = computed(() =>
  sections.find(item => item.value === activeSection.value) ?? sections[0],
)

const form = reactive<LocalMemorySettings>({
  enabled: false,
  maxMemories: 5,
  maxPromptChars: 600,
  writebackEnabled: true,
})
const saving = ref(false)

watch(
  () => data.value?.data,
  (settings) => {
    if (!settings) {
      return
    }

    form.enabled = settings.enabled
    form.maxMemories = settings.maxMemories
    form.maxPromptChars = settings.maxPromptChars
    form.writebackEnabled = settings.writebackEnabled
  },
  { immediate: true },
)

const canSave = computed(() =>
  Number.isFinite(Number(form.maxMemories))
  && Number(form.maxMemories) >= 1
  && Number(form.maxMemories) <= 20
  && Number.isFinite(Number(form.maxPromptChars))
  && Number(form.maxPromptChars) >= 100
  && Number(form.maxPromptChars) <= 4000,
)

async function handleSave() {
  if (!canSave.value) {
    return
  }

  saving.value = true

  try {
    const updated = await $fetch<{ ok: true, data: LocalMemorySettings }>('/api/settings/memory', {
      method: 'PUT',
      body: {
        enabled: form.enabled,
        maxMemories: Number(form.maxMemories),
        maxPromptChars: Number(form.maxPromptChars),
        writebackEnabled: form.writebackEnabled,
      },
    })

    data.value = updated
    toast.add({ title: '已保存记忆设置', color: 'success' })
    await refresh()
  }
  catch (error: any) {
    toast.add({
      title: error?.data?.message ?? error?.message ?? '保存记忆设置失败',
      color: 'error',
    })
  }
  finally {
    saving.value = false
  }
}
</script>
