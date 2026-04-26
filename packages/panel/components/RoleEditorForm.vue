<template>
  <UCard variant="subtle">
    <template #header>
      <div class="flex flex-col gap-1">
        <h1 class="m-0 text-2xl font-bold text-[var(--text-primary)]">
          {{ title }}
        </h1>
        <p v-if="description" class="m-0 text-sm text-[var(--text-secondary)]">
          {{ description }}
        </p>
      </div>
    </template>

    <form class="flex max-w-3xl flex-col gap-6" @submit.prevent="handleSubmit">
      <div class="grid gap-6 lg:grid-cols-[220px_minmax(0,1fr)]">
        <div class="flex self-start flex-col items-center gap-3 px-6 py-2">
          <UAvatar
            :src="state.avatar.trim() || undefined"
            :alt="state.name || '角色头像'"
            :ui="squareAvatarUi"
            class="size-28"
          />

          <UButton
            v-if="state.avatar.trim()"
            label="清除头像"
            type="button"
            color="neutral"
            variant="ghost"
            :disabled="pending || avatarUploadPending"
            @click="clearAvatar"
          />
        </div>

        <div class="space-y-4">
          <UFormField
            label="上传头像"
            name="avatarUpload"
            description="支持 PNG、JPG、WEBP，上传时默认居中裁成方形。"
          >
            <div class="space-y-3">
              <UFileUpload
                v-model="avatarUploadFile"
                accept="image/png,image/jpeg,image/webp"
                :disabled="pending || avatarUploadPending"
                :interactive="!(pending || avatarUploadPending)"
                :preview="false"
                :multiple="false"
                label="点击或拖拽上传头像"
                description="上传完成后会自动填入头像地址。"
                highlight
              >
                <template #actions="{ open }">
                  <UButton
                    :label="avatarUploadPending ? '正在上传' : state.avatar ? '重新选择' : '选择图片'"
                    type="button"
                    color="neutral"
                    variant="outline"
                    :loading="avatarUploadPending"
                    :disabled="pending || avatarUploadPending"
                    @click.stop.prevent="open()"
                  />
                </template>
              </UFileUpload>

              <UAlert
                v-if="avatarUploadError"
                color="error"
                variant="subtle"
                icon="i-heroicons-x-circle-20-solid"
                :description="avatarUploadError"
              />
            </div>
          </UFormField>

          <UFormField
            label="头像地址"
            name="avatar"
            description="上传后会自动填充，也可以直接粘贴外部图片地址；留空时使用默认头像。"
          >
            <UInput
              v-model="state.avatar"
              class="w-full"
              :disabled="pending || avatarUploadPending"
              placeholder="/uploads/avatars/xxxx.png 或 https://example.com/avatar.png"
            />
          </UFormField>

          <UFormField label="名称" name="name" required>
            <UInput
              v-model="state.name"
              class="w-full"
              :disabled="pending"
              placeholder="如：客服助理、翻译姬"
            />
          </UFormField>
        </div>
      </div>

      <UFormField label="提示词" name="systemPrompt" required>
        <UTextarea
          v-model="state.systemPrompt"
          class="w-full"
          :disabled="pending"
          :rows="16"
          placeholder="定义角色的性格、目标、说话方式和约束。"
        />
      </UFormField>

      <UFormField
        label="技能"
        name="enabledSkills"
        description="允许模型在需要时使用这些技能。未勾选的技能对模型不可见。"
      >
        <div class="space-y-3">
          <div v-if="skillsPending && !skills.length" class="space-y-2">
            <USkeleton class="h-10 w-full" />
            <USkeleton class="h-10 w-full" />
          </div>

          <ToolPermissionGroup
            v-else-if="skillItems.length"
            v-model="state.enabledSkills"
            title="可用技能"
            description="勾选后仅表示允许模型按需发现和加载"
            :items="skillItems"
            :disabled="pending"
            empty-text="暂无可用技能。"
          />

          <UEmpty
            v-else
            icon="i-heroicons-academic-cap-20-solid"
            title="暂无技能"
            description="在技能设置中创建或导入技能后，可在这里启用。"
          />

          <UAlert
            v-if="missingSkillTools.length"
            color="warning"
            variant="subtle"
            icon="i-heroicons-exclamation-triangle-20-solid"
            title="技能依赖未启用"
            :description="`请在工具权限中启用：${missingSkillTools.join('、')}`"
          />

          <ToolPermissionGroup
            v-if="unknownSkillItems.length"
            v-model="state.enabledSkills"
            title="已保存但未加载"
            description="已保存但当前未加载"
            note="取消勾选后保存，可从角色配置中移除这些技能。"
            :items="unknownSkillItems"
            :disabled="pending"
          />
        </div>
      </UFormField>

      <UFormField
        label="工具权限"
        name="enabledTools"
        description="允许模型在需要时调用外部能力。标记「敏感」的工具建议在通用设置中开启工具调用安全确认。"
      >
        <div class="space-y-3">
          <ToolPermissionGroup
            v-for="group in toolGroups"
            :key="group.label"
            v-model="state.enabledTools"
            :title="group.label"
            :description="group.description"
            :items="group.tools"
            :disabled="pending"
          />

          <div>
            <div class="mb-2 flex items-center justify-between gap-3 pt-2">
              <p class="m-0 text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">
                MCP 工具
              </p>
              <UButton
                label="刷新"
                color="neutral"
                variant="ghost"
                size="xs"
                :loading="mcpStatusPending"
                :disabled="pending"
                @click="refreshMcpStatus"
              />
            </div>

            <div v-if="mcpStatusPending && !mcpServers.length" class="space-y-2">
              <USkeleton class="h-10 w-full" />
              <USkeleton class="h-10 w-full" />
            </div>

            <div v-else-if="mcpToolGroups.length" class="space-y-3">
              <ToolPermissionGroup
                v-for="group in mcpToolGroups"
                :key="group.id"
                v-model="state.enabledTools"
                :title="group.title"
                :description="group.description"
                :note="group.note"
                :error="group.error"
                :items="group.items"
                :disabled="pending"
              />
            </div>

            <UEmpty
              v-else
              icon="i-heroicons-server-stack-20-solid"
              title="暂无 MCP 工具"
              description="在 MCP 设置中添加并连接服务器后，可在这里启用工具。"
            />

            <div v-if="unknownMcpToolGroups.length" class="mt-3 space-y-3">
              <p class="m-0 text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">
                已保存但未加载
              </p>
              <ToolPermissionGroup
                v-for="group in unknownMcpToolGroups"
                :key="group.id"
                v-model="state.enabledTools"
                :title="group.title"
                description="已保存但当前未加载"
                note="取消勾选后保存，可从角色配置中移除这些工具。"
                :items="group.items"
                :disabled="pending"
              />
            </div>
          </div>
        </div>
      </UFormField>

      <div class="flex flex-wrap items-center justify-between gap-2">
        <div v-if="$slots['actions-left']" class="flex flex-wrap gap-2">
          <slot name="actions-left" />
        </div>

        <div class="ml-auto flex flex-wrap justify-end gap-2">
          <UButton
            label="返回列表"
            color="neutral"
            variant="outline"
            to="/roles"
          />
          <UButton
            :label="submitLabel"
            type="submit"
            :loading="pending"
            :disabled="!canSubmit || avatarUploadPending"
          />
        </div>
      </div>
    </form>
  </UCard>
</template>

<script setup lang="ts">
import {
  createDefaultRoleEditorInput,
  getRoleEditorInputError,
  normalizeRoleEditorInput,
} from '@zakobot/shared'
import type { McpServerStatus, RoleEditorInput, SkillProfile } from '@zakobot/shared'

const props = defineProps<{
  title: string
  description?: string
  submitLabel: string
  initialValue: RoleEditorInput
  pending?: boolean
}>()

const emit = defineEmits<{
  submit: [value: RoleEditorInput]
}>()

const state = reactive<RoleEditorInput>(createDefaultRoleEditorInput())
const normalizedState = computed(() => normalizeRoleEditorInput(state))

interface ToolPermissionItem {
  value: string
  label: string
  description?: string
  detail?: string
  sensitive?: boolean
  disabled?: boolean
}

interface ToolGroup {
  label: string
  description: string
  tools: ToolPermissionItem[]
}

const toolGroups: ToolGroup[] = [
  {
    label: '网络',
    description: '公开网页搜索与浏览',
    tools: [
      { value: 'web_search', label: '网页搜索', description: '通过搜索引擎获取公开网页结果。' },
      { value: 'web_browse', label: '网页浏览', description: '读取公开网页正文，用于摘要和引用。' },
    ],
  },
  {
    label: '系统',
    description: '服务器命令与文件能力',
    tools: [
      { value: 'shell_exec', label: 'Shell 执行', description: '在服务器上执行 Shell 命令，返回 stdout/stderr/退出码。', sensitive: true },
      { value: 'file_read', label: '文件读取', description: '读取文件内容，附带行号，支持分页。' },
      { value: 'file_write', label: '文件写入', description: '创建或覆盖写入文件，父目录不存在时自动创建。', sensitive: true },
      { value: 'file_edit', label: '文件编辑', description: '精确字符串替换，要求目标字符串在文件中唯一出现。', sensitive: true },
      { value: 'file_list', label: '目录列表', description: '列出目录中的文件和子目录，支持递归。' },
      { value: 'render_markdown_table_image', label: '表格转图片', description: '将 Markdown 表格渲染为简约 PNG 图片，适合发到 Discord。' },
    ],
  },
]

const avatarUploadFile = ref<File | null>(null)
const avatarUploadPending = ref(false)
const avatarUploadError = ref('')
const { data: mcpStatusData, pending: mcpStatusPending, refresh: refreshMcpStatusRaw } = useFetch<{ ok: true; data: McpServerStatus[] }>('/api/mcp/status')
const { data: skillsData, pending: skillsPending } = useFetch<{ ok: true; data: SkillProfile[] }>('/api/skills')

const squareAvatarUi = {
  root: 'rounded-md overflow-hidden bg-default',
  image: 'h-full w-full object-cover',
}

watch(
  () => props.initialValue,
  (value) => {
    state.avatar = value.avatar
    state.name = value.name
    state.systemPrompt = value.systemPrompt
    state.enabledTools = [...value.enabledTools]
    state.enabledSkills = [...value.enabledSkills]
    avatarUploadFile.value = null
    avatarUploadError.value = ''
  },
  { immediate: true, deep: true },
)

watch(avatarUploadFile, (file) => {
  if (!file) {
    return
  }

  void uploadAvatar(file)
})

watch(() => state.avatar, () => {
  if (state.avatar.trim()) {
    avatarUploadError.value = ''
  }
})

const canSubmit = computed(() =>
  getRoleEditorInputError(normalizedState.value) === null,
)

const skills = computed(() => skillsData.value?.data ?? [])
const loadedSkillIds = computed(() => new Set(skills.value.map(skill => skill.id)))
const unknownSkillItems = computed(() =>
  state.enabledSkills
    .filter(skillId => !loadedSkillIds.value.has(skillId))
    .map<ToolPermissionItem>(skillId => ({
      value: skillId,
      label: skillId,
      detail: skillId,
    })),
)
const skillItems = computed<ToolPermissionItem[]>(() =>
  skills.value.map(skill => ({
    value: skill.id,
    label: skill.name,
    description: getSkillDescription(skill),
    detail: skill.requiredTools.length ? `依赖工具：${skill.requiredTools.join('、')}` : skill.slug,
    disabled: !skill.enabled,
  })),
)
const missingSkillTools = computed(() => {
  const enabledTools = new Set(state.enabledTools)
  const missing = new Set<string>()

  for (const skill of skills.value) {
    if (!state.enabledSkills.includes(skill.id)) {
      continue
    }

    for (const tool of skill.requiredTools) {
      if (!enabledTools.has(tool)) {
        missing.add(tool)
      }
    }
  }

  return [...missing]
})
const mcpServers = computed(() => mcpStatusData.value?.data ?? [])
const loadedMcpTools = computed(() => new Set(mcpServers.value.flatMap(server => server.toolNames)))
const unknownMcpTools = computed(() =>
  state.enabledTools.filter((tool): tool is string =>
    typeof tool === 'string'
    && tool.startsWith('mcp__')
    && !loadedMcpTools.value.has(tool),
  ),
)
const mcpToolGroups = computed(() =>
  mcpServers.value.map(server => ({
    id: server.id,
    title: `MCP: ${server.name}`,
    description: server.connected ? `${server.toolCount} 个工具` : '未连接',
    note: server.toolNames.length
      ? ''
      : server.connected ? '该服务器暂未暴露工具。' : '连接后可选择该服务器暴露的工具。',
    error: server.error ?? '',
    items: server.toolNames.map<ToolPermissionItem>(toolName => ({
      value: toolName,
      label: getMcpToolDisplayName(server.name, toolName),
      detail: toolName,
      disabled: !server.connected,
    })),
  })),
)
const unknownMcpToolGroups = computed(() => {
  const groups = new Map<string, ToolPermissionItem[]>()

  for (const toolName of unknownMcpTools.value) {
    const serverName = getMcpServerName(toolName)
    const groupKey = serverName || 'unknown'
    const items = groups.get(groupKey) ?? []

    items.push({
      value: toolName,
      label: serverName ? getMcpOriginalToolName(serverName, toolName) : toolName,
      detail: toolName,
    })

    groups.set(groupKey, items)
  }

  return [...groups.entries()].map(([serverName, items]) => ({
    id: `unknown-${serverName}`,
    title: serverName === 'unknown' ? 'MCP: 未识别来源' : `MCP: ${serverName}`,
    items,
  }))
})

function clearAvatar() {
  state.avatar = ''
  avatarUploadError.value = ''
}

function handleSubmit() {
  if (!canSubmit.value) {
    return
  }

  emit('submit', normalizedState.value)
}

function refreshMcpStatus() {
  void refreshMcpStatusRaw()
}

function getSkillDescription(skill: SkillProfile) {
  if (!skill.enabled) {
    return '已关闭'
  }

  return skill.description || '允许模型在相关任务中按需发现和加载。'
}

function getMcpToolDisplayName(serverName: string, toolName: string) {
  return toolName.replace(new RegExp(`^mcp__${escapeRegExp(serverName)}__`), '')
}

function getMcpServerName(toolName: string) {
  const prefix = 'mcp__'
  const separatorIndex = toolName.indexOf('__', prefix.length)

  if (!toolName.startsWith(prefix) || separatorIndex === -1) {
    return ''
  }

  return toolName.slice(prefix.length, separatorIndex)
}

function getMcpOriginalToolName(serverName: string, toolName: string) {
  return toolName.slice(`mcp__${serverName}__`.length) || toolName
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

async function uploadAvatar(file: File) {
  if (!import.meta.client) {
    return
  }

  avatarUploadPending.value = true
  avatarUploadError.value = ''

  try {
    const croppedFile = await cropAvatarToSquare(file)
    const formData = new FormData()
    formData.append('file', croppedFile, croppedFile.name)

    const response = await $fetch<{ ok: true, data: { url: string } }>('/api/uploads/avatar', {
      method: 'POST',
      body: formData,
    })

    state.avatar = response.data.url
  }
  catch (error: any) {
    avatarUploadError.value = error?.data?.message ?? error?.message ?? '头像上传失败'
  }
  finally {
    avatarUploadPending.value = false
    avatarUploadFile.value = null
  }
}

async function cropAvatarToSquare(file: File) {
  const imageUrl = URL.createObjectURL(file)

  try {
    const image = await loadImage(imageUrl)
    const sourceWidth = image.naturalWidth || image.width
    const sourceHeight = image.naturalHeight || image.height
    const sourceSize = Math.min(sourceWidth, sourceHeight)
    const offsetX = (sourceWidth - sourceSize) / 2
    const offsetY = (sourceHeight - sourceSize) / 2
    const canvas = document.createElement('canvas')
    const targetSize = 512

    canvas.width = targetSize
    canvas.height = targetSize

    const context = canvas.getContext('2d')

    if (!context) {
      throw new Error('当前环境不支持头像裁剪')
    }

    context.drawImage(
      image,
      offsetX,
      offsetY,
      sourceSize,
      sourceSize,
      0,
      0,
      targetSize,
      targetSize,
    )

    const blob = await canvasToBlob(canvas, 'image/png')
    return new File([blob], `${getFileBaseName(file.name)}.png`, {
      type: 'image/png',
      lastModified: Date.now(),
    })
  }
  finally {
    URL.revokeObjectURL(imageUrl)
  }
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image()

    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('头像图片读取失败'))
    image.src = src
  })
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('头像裁剪失败'))
        return
      }

      resolve(blob)
    }, type)
  })
}

function getFileBaseName(fileName: string) {
  return fileName.replace(/\.[^.]+$/, '').trim() || 'avatar'
}
</script>
