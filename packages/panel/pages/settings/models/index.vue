<template>
  <div class="flex h-full gap-6">
    <aside class="w-72 shrink-0">
      <UCard variant="subtle" class="flex h-full flex-col">
        <template #header>
          <div class="flex items-center justify-between gap-3">
            <div>
              <h2 class="m-0 text-sm font-semibold text-[var(--text-primary)]">
                模型设置
              </h2>
              <p class="mt-1 text-xs text-[var(--text-secondary)]">
                管理接口平台与模型列表
              </p>
            </div>
            <UButton
              icon="i-heroicons-plus-20-solid"
              size="xs"
              variant="ghost"
              color="neutral"
              aria-label="添加平台"
              @click="showAddModal = true"
            />
          </div>
        </template>

        <div class="flex min-h-0 flex-1 flex-col gap-2">
          <UAlert
            v-if="initialLoadError"
            color="error"
            variant="subtle"
            icon="i-heroicons-exclamation-triangle-20-solid"
            title="平台列表加载失败"
            :description="initialLoadError"
          />

          <div v-if="platforms.length" class="min-h-0 flex-1 space-y-1 overflow-y-auto">
            <UButton
              v-for="p in platforms"
              :key="p.id"
              color="neutral"
              :variant="selectedId === p.id ? 'soft' : 'ghost'"
              class="w-full justify-start px-3 py-2"
              :ui="{
                base: 'group',
                leadingIcon: 'hidden',
                trailingIcon: 'hidden',
                label: 'flex-1 min-w-0'
              }"
              @click="selectedId = p.id"
            >
              <span class="flex min-w-0 flex-1 items-center gap-2">
            <USwitch
              :model-value="p.enabled"
              size="xs"
              @update:model-value="handleTogglePlatformEnabled(p.id)"
              @click.stop
            />
                <span class="truncate text-sm">{{ p.name }}</span>
                <UBadge
                  v-if="!p.builtin"
                  :label="getFormatLabel(p.format)"
                  color="neutral"
                  variant="subtle"
                />
              </span>

              <template #trailing>
                <UButton
                  v-if="!p.builtin"
                  icon="i-heroicons-trash-20-solid"
                  size="xs"
                  variant="ghost"
                  color="neutral"
                  class="opacity-0 transition-opacity group-hover:opacity-100"
                  :aria-label="`删除 ${p.name}`"
                  @click.stop="handleRemove(p.id, p.name)"
                />
              </template>
            </UButton>
          </div>

          <UEmpty
            v-else
            icon="i-heroicons-server-stack-20-solid"
            title="暂无平台"
            description="点击右上角添加一个模型平台。"
          />
        </div>
      </UCard>
    </aside>

    <div class="min-w-0 flex-1 overflow-y-auto">
      <UCard v-if="selectedPlatform" variant="subtle">
        <template #header>
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-3">
              <h3 class="m-0 text-xl font-bold text-[var(--text-primary)]">
                {{ selectedPlatform.name }}
              </h3>
              <UBadge :label="getFormatLabel(selectedPlatform.format)" color="neutral" variant="subtle" />
              <span v-if="selectedPlatform.defaultBaseUrl" class="text-xs font-mono text-[var(--text-secondary)]">{{ selectedPlatform.defaultBaseUrl }}</span>
            </div>
            <USwitch :model-value="selectedPlatform.enabled" @update:model-value="handleTogglePlatformEnabled(selectedPlatform.id)" />
          </div>
        </template>

        <div class="flex max-w-xl flex-col gap-4">
          <!-- Vertex AI fields -->
          <template v-if="selectedPlatform.format === 'vertex'">
            <UFormField label="服务账号 JSON" name="credentials">
              <div class="flex items-center gap-3">
                <UButton
                  label="上传 JSON 文件"
                  icon="i-heroicons-arrow-up-tray-20-solid"
                  color="neutral"
                  variant="outline"
                  @click="fileInputRef?.click()"
                />
                <span v-if="parsedVertexCreds" class="text-sm text-[var(--text-secondary)]">
                  项目：<span class="font-mono font-medium text-[var(--text-primary)]">{{ parsedVertexCreds.project_id }}</span>
                </span>
                <span v-else class="text-sm text-[var(--text-secondary)]">未加载凭证</span>
                <input ref="fileInputRef" type="file" accept=".json" class="hidden" @change="handleCredentialFileUpload">
              </div>
            </UFormField>

            <UFormField label="区域" name="region" hint="留空或填 global 表示全球端点，也可填写具体区域如 us-central1">
              <UInput v-model="editRegion" class="w-full" placeholder="global" />
            </UFormField>

            <UFormField v-if="parsedVertexCreds" label="推理端点（只读）" name="vertexEndpoint">
              <UInput :model-value="computedVertexEndpoint" readonly class="w-full font-mono text-xs" />
            </UFormField>
          </template>

          <!-- OpenAI / Google fields -->
          <template v-else>
            <UFormField label="接口地址" name="baseUrl" :hint="selectedPlatform.format === 'google' ? '用于模型列表拉取，LLM 调用请设为 OpenAI 兼容端点' : undefined">
              <UInput v-model="editBaseUrl" class="w-full" :placeholder="selectedPlatform.defaultBaseUrl || 'https://api.example.com/v1'" :readonly="selectedPlatform.builtin" />
            </UFormField>

            <UFormField label="接口密钥" name="apiKey">
              <UInput v-model="editApiKey" :type="showApiKey ? 'text' : 'password'" placeholder="输入 API Key">
                <template #trailing>
                  <UButton
                    :icon="showApiKey ? 'i-heroicons-eye-slash-20-solid' : 'i-heroicons-eye-20-solid'"
                    size="xs"
                    variant="ghost"
                    color="neutral"
                    class="mr-1"
                    @click="showApiKey = !showApiKey"
                  />
                </template>
              </UInput>
            </UFormField>
          </template>

          <div class="flex flex-wrap items-center gap-2">
            <UButton
              v-if="selectedPlatform.format !== 'vertex'"
              label="拉取模型列表"
              :loading="fetchingModels"
              :disabled="!canFetchModels"
              @click="handleFetchModels"
            />
            <UButton
              label="保存"
              color="neutral"
              variant="outline"
              @click="handleSave"
            />
          </div>

          <UAlert
            v-if="fetchError"
            color="error"
            variant="subtle"
            icon="i-heroicons-x-circle-20-solid"
            title="拉取模型列表失败"
            :description="fetchError"
          />

          <div v-if="selectedPlatform.enabledModels.length" class="flex flex-col gap-2">
            <div class="flex items-center gap-2">
              <h4 class="m-0 text-sm font-semibold text-[var(--text-primary)]">已启用模型</h4>
              <UBadge :label="String(selectedPlatform.enabledModels.length)" color="primary" variant="subtle" size="lg" />
            </div>
            <div class="flex flex-wrap gap-1.5">
              <div v-for="m in selectedPlatform.enabledModels" :key="m" class="group inline-flex items-center">
                <UBadge
                  :label="m"
                  color="primary"
                  variant="outline"
                  size="xl"
                  class="cursor-pointer font-mono"
                  title="点击禁用"
                  @click="handleDisableModel(selectedPlatform.id, m)"
                />
                <UButton
                  icon="i-heroicons-x-mark-20-solid"
                  size="xs"
                  variant="ghost"
                  color="error"
                  class="ml-0.5 opacity-0 transition-opacity group-hover:opacity-100"
                  @click="handleRemoveModel(selectedPlatform.id, m)"
                />
              </div>
            </div>
          </div>

          <div v-if="selectedPlatform.disabledModels.length" class="flex flex-col gap-2">
            <div class="flex items-center gap-2">
              <h4 class="m-0 text-sm font-semibold text-[var(--text-secondary)]">已禁用模型</h4>
              <UBadge :label="String(selectedPlatform.disabledModels.length)" color="neutral" variant="subtle" size="lg" />
            </div>
            <div class="flex flex-wrap gap-1.5">
              <div v-for="m in selectedPlatform.disabledModels" :key="m" class="group inline-flex items-center">
                <UBadge
                  :label="m"
                  color="neutral"
                  variant="subtle"
                  size="xl"
                  class="cursor-pointer font-mono"
                  title="点击启用"
                  @click="handleEnableModel(selectedPlatform.id, m)"
                />
                <UButton
                  icon="i-heroicons-x-mark-20-solid"
                  size="xs"
                  variant="ghost"
                  color="error"
                  class="ml-0.5 opacity-0 transition-opacity group-hover:opacity-100"
                  @click="handleRemoveModel(selectedPlatform.id, m)"
                />
              </div>
            </div>
          </div>

          <UEmpty
            v-if="!selectedPlatform.enabledModels.length && !selectedPlatform.disabledModels.length"
            icon="i-heroicons-circle-stack-20-solid"
            title="暂无模型列表"
            :description="selectedPlatform.format === 'vertex' ? '请手动添加需要使用的模型。' : '保存配置后拉取模型列表，或手动添加自定义模型。'"
          />

          <div class="flex items-center gap-2">
            <UInput
              v-model="customModelInput"
              class="flex-1"
              placeholder="输入自定义模型名称"
              @keydown.enter="handleAddCustomModel"
            />
            <UButton
              label="添加"
              color="neutral"
              variant="outline"
              :disabled="!customModelInput.trim()"
              @click="handleAddCustomModel"
            />
          </div>
        </div>
      </UCard>

      <div v-else class="flex h-full items-center justify-center">
        <UEmpty
          icon="i-heroicons-cpu-chip-20-solid"
          title="选择一个平台"
          description="从左侧选择一个平台查看和编辑配置。"
        />
      </div>
    </div>

    <UModal v-model:open="showAddModal" title="添加平台">
      <template #body>
        <div class="space-y-4">
          <UFormField label="平台名称" name="name">
            <UInput
              v-model="newPlatformName"
              class="w-full"
              placeholder="如：深度求索、硅基流动"
              @keydown.enter="handleAddPlatform"
            />
          </UFormField>
          <UFormField label="接入格式" name="format">
            <USelect v-model="newPlatformFormat" class="w-full" :items="formatOptions" />
          </UFormField>
        </div>
      </template>

      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton label="取消" color="neutral" variant="outline" @click="showAddModal = false" />
          <UButton label="确定" :disabled="!newPlatformName.trim()" @click="handleAddPlatform" />
        </div>
      </template>
    </UModal>
  </div>
</template>

<script setup lang="ts">
import { useModelPlatforms } from '~/composables/modelPlatforms'
import { refreshModelPlatformsSafely } from '~/composables/modelPlatforms-load'
import type { ApiFormat } from '~/composables/modelPlatforms'

const {
  platforms,
  loaded,
  refresh,
  addPlatform,
  updatePlatform,
  removePlatform,
  togglePlatformEnabled,
  enableModel,
  disableModel,
  addCustomModel,
  removeModel,
  fetchModels,
} = useModelPlatforms()

const initialLoadError = ref('')

await callOnce(async () => {
  const refreshed = await refreshModelPlatformsSafely(refresh)
  initialLoadError.value = refreshed ? '' : '暂时无法连接模型平台服务，请稍后重试。'
})

const toast = useToast()

const selectedId = ref<string | null>(null)
const selectedPlatform = computed(() => platforms.value.find(p => p.id === selectedId.value) ?? null)

const editBaseUrl = ref('')
const editApiKey = ref('')
const showApiKey = ref(false)
const editRegion = ref('global')
const editCredentialsJson = ref('')

watch(selectedPlatform, (p) => {
  if (p) {
    if (p.format === 'vertex') {
      editCredentialsJson.value = p.apiKey
      editRegion.value = p.region ?? 'global'
    }
    else {
      editBaseUrl.value = p.baseUrl
      editApiKey.value = p.apiKey
    }
    showApiKey.value = false
    customModelInput.value = ''
  }
  else {
    editBaseUrl.value = ''
    editApiKey.value = ''
    editCredentialsJson.value = ''
    editRegion.value = 'global'
    showApiKey.value = false
  }
}, { immediate: true })

watch(platforms, (items) => {
  if (!items.length) {
    selectedId.value = null
    return
  }
  if (!selectedId.value || !items.some(item => item.id === selectedId.value)) {
    selectedId.value = items[0]?.id ?? null
  }
}, { immediate: true })

watch(loaded, (value) => {
  if (value) {
    initialLoadError.value = ''
  }
}, { immediate: true })

function getFormatLabel(format: ApiFormat) {
  switch (format) {
    case 'openai': return 'OpenAI'
    case 'google': return 'Google AI'
    case 'vertex': return 'Vertex AI'
    default: return format
  }
}

const showAddModal = ref(false)
const newPlatformName = ref('')
const newPlatformFormat = ref<ApiFormat>('openai')
const formatOptions = [
  { label: 'OpenAI 兼容格式', value: 'openai' },
  { label: 'Google AI 格式', value: 'google' },
  { label: 'Google Vertex AI', value: 'vertex' },
]

const fileInputRef = ref<HTMLInputElement | null>(null)

const parsedVertexCreds = computed<{ project_id: string, client_email: string } | null>(() => {
  if (!editCredentialsJson.value) return null
  try {
    const parsed = JSON.parse(editCredentialsJson.value)
    if (parsed.type === 'service_account' && parsed.project_id && parsed.private_key)
      return parsed as { project_id: string, client_email: string }
    return null
  }
  catch { return null }
})

const computedVertexEndpoint = computed(() => {
  if (!parsedVertexCreds.value) return ''
  const { project_id } = parsedVertexCreds.value
  const loc = editRegion.value.trim() || 'global'
  if (loc === 'global')
    return `https://aiplatform.googleapis.com/v1beta1/projects/${project_id}/locations/global/endpoints/openapi`
  return `https://${loc}-aiplatform.googleapis.com/v1beta1/projects/${project_id}/locations/${loc}/endpoints/openapi`
})

const canFetchModels = computed(() => {
  if (!selectedPlatform.value) return false
  if (selectedPlatform.value.format === 'vertex') return false
  return !!(editBaseUrl.value && editApiKey.value)
})

function handleCredentialFileUpload(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  const reader = new FileReader()
  reader.onload = (e) => {
    const text = e.target?.result as string
    try {
      const parsed = JSON.parse(text)
      if (parsed.type !== 'service_account' || !parsed.private_key) {
        toast.add({ title: '不是有效的服务账号 JSON 文件', color: 'error' })
        return
      }
      editCredentialsJson.value = text
      toast.add({ title: `已加载项目 ${parsed.project_id}`, color: 'success' })
    }
    catch {
      toast.add({ title: '无法解析 JSON 文件', color: 'error' })
    }
  }
  reader.readAsText(file)
  input.value = ''
}

function getErrorMessage(error: any, fallback: string) {
  return error?.data?.message ?? error?.message ?? fallback
}

async function handleAddPlatform() {
  const name = newPlatformName.value.trim()
  if (!name) return

  try {
    const platform = await addPlatform(name, newPlatformFormat.value)
    selectedId.value = platform.id
    newPlatformName.value = ''
    showAddModal.value = false
    toast.add({ title: `已添加平台「${name}」`, color: 'success' })
  }
  catch (error: any) {
    toast.add({ title: getErrorMessage(error, '添加平台失败'), color: 'error' })
  }
}

async function saveSelectedPlatform() {
  if (!selectedId.value || !selectedPlatform.value) return

  if (selectedPlatform.value.format === 'vertex') {
    const creds = parsedVertexCreds.value
    if (editCredentialsJson.value && !creds) {
      toast.add({ title: '请上传有效的服务账号 JSON 文件', color: 'error' })
      return false
    }
    const region = editRegion.value.trim() || 'global'
    try {
      await updatePlatform(selectedId.value, {
        apiKey: editCredentialsJson.value,
        baseUrl: computedVertexEndpoint.value || selectedPlatform.value.defaultBaseUrl,
        region,
      })
    }
    catch (error: any) {
      toast.add({ title: getErrorMessage(error, '保存失败'), color: 'error' })
      return false
    }
  }
  else {
    try {
      await updatePlatform(selectedId.value, {
        baseUrl: editBaseUrl.value.trim(),
        apiKey: editApiKey.value.trim(),
      })
    }
    catch (error: any) {
      toast.add({ title: getErrorMessage(error, '保存失败'), color: 'error' })
      return false
    }
  }

  toast.add({ title: '已保存', color: 'success' })
  return true
}

async function handleSave() {
  await saveSelectedPlatform()
}

async function handleRemove(id: string, name: string) {
  try {
    await removePlatform(id)
    if (selectedId.value === id) selectedId.value = null
    toast.add({ title: `已删除「${name}」` })
  }
  catch (error: any) {
    toast.add({ title: getErrorMessage(error, '删除平台失败'), color: 'error' })
  }
}

const fetchingModels = ref(false)
const fetchError = ref('')

async function handleFetchModels() {
  if (!selectedId.value) return

  const saved = await saveSelectedPlatform()
  if (!saved) return

  fetchingModels.value = true
  fetchError.value = ''

  try {
    const models = await fetchModels(selectedId.value)
    toast.add({ title: `已获取 ${models.length} 个模型`, color: 'success' })
  }
  catch (e: any) {
    fetchError.value = e?.message ?? '拉取模型列表失败'
    toast.add({ title: fetchError.value, color: 'error' })
  }
  finally {
    fetchingModels.value = false
  }
}

const customModelInput = ref('')

async function handleTogglePlatformEnabled(id: string) {
  try {
    await togglePlatformEnabled(id)
  }
  catch (error: any) {
    toast.add({ title: getErrorMessage(error, '更新平台状态失败'), color: 'error' })
  }
}

async function handleEnableModel(platformId: string, model: string) {
  try {
    await enableModel(platformId, model)
  }
  catch (error: any) {
    toast.add({ title: getErrorMessage(error, '启用模型失败'), color: 'error' })
  }
}

async function handleDisableModel(platformId: string, model: string) {
  try {
    await disableModel(platformId, model)
  }
  catch (error: any) {
    toast.add({ title: getErrorMessage(error, '禁用模型失败'), color: 'error' })
  }
}

async function handleRemoveModel(platformId: string, model: string) {
  try {
    await removeModel(platformId, model)
  }
  catch (error: any) {
    toast.add({ title: getErrorMessage(error, '删除模型失败'), color: 'error' })
  }
}

async function handleAddCustomModel() {
  if (!selectedId.value) return
  const name = customModelInput.value.trim()
  if (!name) return

  try {
    await addCustomModel(selectedId.value, name)
    customModelInput.value = ''
    toast.add({ title: `已添加自定义模型「${name}」`, color: 'success' })
  }
  catch (error: any) {
    toast.add({ title: getErrorMessage(error, '添加自定义模型失败'), color: 'error' })
  }
}
</script>
