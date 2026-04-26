<template>
  <div class="flex h-full gap-6">
    <aside class="w-72 shrink-0">
      <UCard variant="subtle" class="flex h-full flex-col">
        <template #header>
          <div>
            <h2 class="m-0 text-sm font-semibold text-[var(--text-primary)]">
              通用设置
            </h2>
            <p class="mt-1 text-xs text-[var(--text-secondary)]">
              全局行为配置
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
            title="通用设置加载失败"
            :description="error.message"
          />

          <USkeleton v-else-if="pending" class="h-40 w-full" />

          <template v-else>
            <section v-if="activeSection === 'prompt'" class="space-y-4">
              <UFormField
                label="系统提示词"
                name="systemPrompt"
                description="作为所有角色的全局系统提示词，会放在提示词最上方发送。"
              >
                <UTextarea
                  v-model="form.systemPrompt"
                  class="w-full"
                  :disabled="saving"
                  :rows="12"
                  placeholder="输入全局规则、身份边界或回复约束。"
                />
              </UFormField>
            </section>

            <section v-else-if="activeSection === 'agent'" class="space-y-4">
              <UFormField
                label="工具调用轮次上限"
                name="maxToolCallRounds"
                description="单次对话中 LLM 最多连续调用工具的轮数。超过此限制后将强制输出最终回答。范围：1 – 32。"
              >
                <UInput
                  v-model.number="form.maxToolCallRounds"
                  class="w-full"
                  type="number"
                  min="1"
                  max="32"
                  step="1"
                  :disabled="saving"
                />
              </UFormField>

              <UFormField
                label="工具调用安全级别"
                name="toolApprovalMode"
                description="控制哪些工具调用需要在 Discord 中弹出允许/拒绝确认。"
              >
                <div class="flex flex-col gap-2 pt-1">
                  <label
                    v-for="opt in toolApprovalOptions"
                    :key="opt.value"
                    class="flex cursor-pointer items-start gap-3 rounded-lg border border-[var(--border-subtle)] p-3 transition-colors"
                    :class="form.toolApprovalMode === opt.value ? 'border-[var(--color-primary-500)] bg-[var(--color-primary-50)] dark:bg-[var(--color-primary-950)]' : 'hover:bg-[var(--bg-subtle)]'"
                  >
                    <input
                      v-model="form.toolApprovalMode"
                      type="radio"
                      :value="opt.value"
                      :disabled="saving"
                      class="mt-0.5 accent-[var(--color-primary-500)]"
                    >
                    <div>
                      <div class="text-sm font-medium text-[var(--text-primary)]">
                        {{ opt.label }}
                      </div>
                      <div class="text-xs text-[var(--text-secondary)]">
                        {{ opt.description }}
                      </div>
                    </div>
                  </label>
                </div>
              </UFormField>

              <UFormField
                label="工具调用过程展示"
                name="toolProcessMode"
                description="控制 Discord 中工具调用过程的可见程度。"
              >
                <div class="flex flex-col gap-2 pt-1">
                  <label
                    v-for="opt in toolProcessOptions"
                    :key="opt.value"
                    class="flex cursor-pointer items-start gap-3 rounded-lg border border-[var(--border-subtle)] p-3 transition-colors"
                    :class="form.toolProcessMode === opt.value ? 'border-[var(--color-primary-500)] bg-[var(--color-primary-50)] dark:bg-[var(--color-primary-950)]' : 'hover:bg-[var(--bg-subtle)]'"
                  >
                    <input
                      v-model="form.toolProcessMode"
                      type="radio"
                      :value="opt.value"
                      :disabled="saving"
                      class="mt-0.5 accent-[var(--color-primary-500)]"
                    >
                    <div>
                      <div class="text-sm font-medium text-[var(--text-primary)]">
                        {{ opt.label }}
                      </div>
                      <div class="text-xs text-[var(--text-secondary)]">
                        {{ opt.description }}
                      </div>
                    </div>
                  </label>
                </div>
              </UFormField>
            </section>

            <section v-else-if="activeSection === 'discord'" class="space-y-4">
              <UFormField
                label="需要 @ 触发"
                name="requireMention"
                description="开启后机器人仅在被 @ 提及时才响应消息；关闭后将回复所有频道消息。"
              >
                <div class="flex h-10 items-center">
                  <USwitch v-model="form.requireMention" :disabled="saving" />
                </div>
              </UFormField>

              <UFormField
                label="子区模式"
                name="threadMode"
                description="开启后机器人将为每条频道消息自动创建子区并在其中回复，用户的消息将作为子区标题。"
              >
                <div class="flex h-10 items-center">
                  <USwitch v-model="form.threadMode" :disabled="saving" />
                </div>
              </UFormField>

              <UFormField
                label="每频道最大子区数"
                name="maxThreadsPerChannel"
                description="子区模式下，bot 在每个频道自动创建的子区上限。超出时将按时间自动删除最早创建的子区。设为 0 则禁用此限制。范围：0 – 100。"
              >
                <UInput
                  v-model.number="form.maxThreadsPerChannel"
                  class="w-full"
                  type="number"
                  min="0"
                  max="100"
                  step="1"
                  :disabled="saving || !form.threadMode"
                />
              </UFormField>
            </section>

            <section v-else-if="activeSection === 'time'" class="space-y-4">
              <UFormField
                label="发送时间"
                name="sendTime"
                description="开启后在每次请求中将当前时间附加到用户最后一条消息末尾，让 LLM 感知时间上下文。"
              >
                <div class="flex h-10 items-center">
                  <USwitch v-model="form.sendTime" :disabled="saving" />
                </div>
              </UFormField>

              <UFormField
                label="时区"
                name="timezone"
                description="发送时间所使用的时区，格式为 IANA 时区名称，例如 Asia/Shanghai、America/New_York、UTC。"
              >
                <UInput
                  v-model="form.timezone"
                  class="w-full"
                  placeholder="Asia/Shanghai"
                  :disabled="saving || !form.sendTime"
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
import type { GeneralSettings, ToolApprovalMode, ToolProcessMode } from '@zakobot/shared'

type GeneralSection = 'prompt' | 'agent' | 'discord' | 'time'

const toolApprovalOptions: Array<{ label: string; value: ToolApprovalMode; description: string }> = [
  { label: '始终确认', value: 'all', description: '所有工具调用都需要用户点击允许后才会执行。' },
  { label: '仅敏感工具', value: 'sensitive', description: '仅对标记为敏感的工具（如执行命令、写入文件）弹出确认。' },
  { label: '无需确认', value: 'none', description: '所有工具调用自动执行，不弹出任何确认。' },
]

const toolProcessOptions: Array<{ label: string; value: ToolProcessMode; description: string }> = [
  { label: '不展示', value: 'none', description: 'AI 静默调用工具，只发送最终回答。' },
  { label: '只展示工具名', value: 'tools_only', description: '调用工具时发送简短通知，不显示参数和结果详情。' },
  { label: '全部展示', value: 'full', description: '展示工具名、调用参数和执行结果。' },
]

const toast = useToast()

const sections: Array<{
  label: string
  value: GeneralSection
  icon: string
  description: string
}> = [
  {
    label: '系统提示词',
    value: 'prompt',
    icon: 'i-heroicons-document-text-20-solid',
    description: '配置全局系统提示词。',
  },
  {
    label: 'AI 代理',
    value: 'agent',
    icon: 'i-heroicons-cpu-chip-20-solid',
    description: '配置 LLM 工具调用行为。',
  },
  {
    label: 'Discord',
    value: 'discord',
    icon: 'i-heroicons-chat-bubble-left-ellipsis-20-solid',
    description: '配置 Discord 消息触发规则。',
  },
  {
    label: '时间',
    value: 'time',
    icon: 'i-heroicons-clock-20-solid',
    description: '配置发送时间与时区。',
  },
]

const { data, pending, error, refresh } = await useFetch<{ ok: true, data: GeneralSettings }>('/api/settings/general')

const activeSection = ref<GeneralSection>('prompt')
const activeSectionMeta = computed(() =>
  sections.find(item => item.value === activeSection.value) ?? sections[0]!,
)

const form = reactive<GeneralSettings>({
  systemPrompt: '',
  maxToolCallRounds: 8,
  requireMention: true,
  threadMode: false,
  maxThreadsPerChannel: 0,
  sendTime: false,
  timezone: 'UTC',
  toolApprovalMode: 'all',
  toolProcessMode: 'full',
})
const saving = ref(false)

watch(
  () => data.value?.data,
  (settings) => {
    if (!settings) return
    form.systemPrompt = settings.systemPrompt
    form.maxToolCallRounds = settings.maxToolCallRounds
    form.requireMention = settings.requireMention
    form.threadMode = settings.threadMode
    form.maxThreadsPerChannel = settings.maxThreadsPerChannel
    form.sendTime = settings.sendTime
    form.timezone = settings.timezone
    form.toolApprovalMode = settings.toolApprovalMode
    form.toolProcessMode = settings.toolProcessMode
  },
  { immediate: true },
)

const canSave = computed(() =>
  Number.isInteger(Number(form.maxToolCallRounds))
  && Number(form.maxToolCallRounds) >= 1
  && Number(form.maxToolCallRounds) <= 32,
)

async function handleSave() {
  if (!canSave.value) return

  saving.value = true

  try {
    const updated = await $fetch<{ ok: true, data: GeneralSettings }>('/api/settings/general', {
      method: 'PUT',
      body: {
        systemPrompt: form.systemPrompt.trim(),
        maxToolCallRounds: Number(form.maxToolCallRounds),
        requireMention: form.requireMention,
        threadMode: form.threadMode,
        maxThreadsPerChannel: Number(form.maxThreadsPerChannel),
        sendTime: form.sendTime,
        timezone: form.timezone,
        toolApprovalMode: form.toolApprovalMode,
        toolProcessMode: form.toolProcessMode,
      },
    })

    data.value = updated
    toast.add({ title: '已保存通用设置', color: 'success' })
    await refresh()
  }
  catch (err: any) {
    toast.add({
      title: err?.data?.message ?? err?.message ?? '保存通用设置失败',
      color: 'error',
    })
  }
  finally {
    saving.value = false
  }
}
</script>
