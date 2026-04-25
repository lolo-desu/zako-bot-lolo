<template>
  <div class="flex h-full gap-6">
    <aside class="w-72 shrink-0">
      <UCard variant="subtle" class="flex h-full flex-col">
        <template #header>
          <div class="flex items-center justify-between gap-3">
            <div>
              <h2 class="m-0 text-sm font-semibold text-[var(--text-primary)]">
                技能
              </h2>
              <p class="mt-1 text-xs text-[var(--text-secondary)]">
                管理角色可用的工作流
              </p>
            </div>

            <div class="flex items-center gap-1">
              <UButton
                icon="i-heroicons-arrow-path-20-solid"
                size="xs"
                variant="ghost"
                color="neutral"
                aria-label="刷新"
                :loading="pending"
                @click="refresh"
              />
              <UButton
                icon="i-heroicons-plus-20-solid"
                size="xs"
                variant="ghost"
                color="neutral"
                aria-label="新增技能"
                @click="openCreate"
              />
            </div>
          </div>
        </template>

        <div class="mb-4">
          <UFileUpload
            v-model="uploadFile"
            accept=".md,.markdown,.zip,text/markdown,application/zip"
            :disabled="uploading"
            :interactive="!uploading"
            :preview="false"
            :multiple="false"
            label="上传 Skill"
            description="支持 Markdown 或 ZIP。"
            highlight
          >
            <template #actions="{ open }">
              <UButton
                :label="uploading ? '正在上传' : '选择文件'"
                type="button"
                size="sm"
                color="neutral"
                variant="outline"
                :loading="uploading"
                :disabled="uploading"
                @click.stop.prevent="open()"
              />
            </template>
          </UFileUpload>
        </div>

        <div class="flex min-h-0 flex-1 flex-col gap-2">
          <div v-if="pending && !skills.length" class="space-y-2">
            <USkeleton class="h-14 w-full" />
            <USkeleton class="h-14 w-full" />
            <USkeleton class="h-14 w-full" />
          </div>

          <div v-else-if="skills.length" class="min-h-0 flex-1 space-y-1 overflow-y-auto">
            <UButton
              v-for="skill in skills"
              :key="skill.id"
              color="neutral"
              :variant="!isCreating && selectedId === skill.id ? 'soft' : 'ghost'"
              class="w-full justify-start px-3 py-2"
              :ui="{ label: 'min-w-0 flex-1' }"
              @click="selectSkill(skill.id)"
            >
              <span class="min-w-0 flex-1 text-left">
                <span class="block truncate text-sm font-medium">{{ skill.name }}</span>
                <span class="block truncate text-xs text-[var(--text-secondary)]">
                  {{ skill.description || skill.slug }}
                </span>
              </span>

              <template #trailing>
                <div class="flex items-center gap-2">
                  <UBadge
                    :label="skill.enabled ? '开启' : '关闭'"
                    :color="skill.enabled ? 'success' : 'neutral'"
                    variant="subtle"
                    size="sm"
                  />
                  <UBadge
                    v-if="skill.referenceCount"
                    :label="String(skill.referenceCount)"
                    color="neutral"
                    variant="subtle"
                    size="sm"
                  />
                </div>
              </template>
            </UButton>
          </div>

          <UEmpty
            v-else
            icon="i-heroicons-academic-cap-20-solid"
            title="暂无技能"
            description="点击右上角创建技能，或上传 Markdown、ZIP 文件。"
          />
        </div>
      </UCard>
    </aside>

    <div class="min-w-0 flex-1 overflow-y-auto">
      <div class="flex flex-col gap-4">
        <UAlert
          v-if="errorMessage"
          color="error"
          variant="subtle"
          icon="i-heroicons-x-circle-20-solid"
          title="技能加载失败"
          :description="errorMessage"
        />

        <UAlert
          v-if="deleteTarget"
          color="error"
          variant="subtle"
          icon="i-heroicons-exclamation-triangle-20-solid"
          title="确认删除技能"
          :description="`技能「${deleteTarget.name}」删除后，角色将无法继续使用。`"
          :actions="deleteConfirmActions"
          orientation="horizontal"
        />

        <UCard v-if="isCreating || selectedSkill" variant="subtle">
          <template #header>
            <div class="flex flex-wrap items-center justify-between gap-3">
              <div class="min-w-0">
                <div class="flex min-w-0 flex-wrap items-center gap-2">
                  <h3 class="m-0 truncate text-xl font-bold text-[var(--text-primary)]">
                    {{ isCreating ? '新增技能' : selectedSkill?.name }}
                  </h3>
                  <UBadge
                    :label="isCreating ? 'manual' : selectedSkill?.sourceType"
                    color="neutral"
                    variant="subtle"
                  />
                  <UBadge
                    :label="form.enabled ? '开启' : '关闭'"
                    :color="form.enabled ? 'success' : 'neutral'"
                    variant="subtle"
                  />
                </div>
                <p v-if="!isCreating && selectedSkill" class="mt-1 truncate text-xs text-[var(--text-secondary)]">
                  {{ selectedSkill.slug }}
                </p>
              </div>

              <div class="flex flex-wrap items-center gap-2">
                <UButton
                  v-if="!isCreating && selectedSkill"
                  label="删除"
                  color="error"
                  variant="outline"
                  :disabled="saving"
                  @click="deleteTarget = selectedSkill"
                />
              </div>
            </div>
          </template>

          <form class="flex max-w-3xl flex-col gap-4" @submit.prevent="saveSkill">
            <UAlert
              v-if="contentLoading"
              color="neutral"
              variant="subtle"
              title="正在加载"
            />

            <UFormField label="名称" name="name">
              <UInput
                v-model="form.name"
                class="w-full"
                placeholder="如：代码审查助手"
                :disabled="saving"
              />
            </UFormField>

            <UFormField label="描述" name="description">
              <UInput
                v-model="form.description"
                class="w-full"
                placeholder="用于说明技能适用场景"
                :disabled="saving"
              />
            </UFormField>

            <UFormField
              label="依赖工具"
              name="requiredTools"
              description="多个工具名用逗号分隔。"
            >
              <UInput
                v-model="requiredToolsText"
                class="w-full font-mono"
                placeholder="render_markdown_table_image, file_read"
                :disabled="saving"
              />
            </UFormField>

            <UFormField label="状态" name="enabled">
              <USwitch
                v-model="form.enabled"
                :disabled="saving"
              />
            </UFormField>

            <UFormField label="内容" name="content" required>
              <UTextarea
                v-model="form.content"
                class="w-full font-mono"
                :rows="22"
                placeholder="# 技能名称"
                :disabled="saving"
              />
            </UFormField>

            <div v-if="references.length" class="rounded-lg border border-[var(--card-border)] p-4">
              <p class="m-0 mb-3 text-sm font-semibold text-[var(--text-primary)]">
                参考文件
              </p>
              <div class="flex flex-wrap gap-2">
                <UBadge
                  v-for="reference in references"
                  :key="reference.path"
                  :label="reference.path"
                  color="neutral"
                  variant="subtle"
                />
              </div>
            </div>

            <div class="flex flex-wrap justify-end gap-2">
              <UButton
                label="取消"
                type="button"
                color="neutral"
                variant="outline"
                :disabled="saving"
                @click="cancelEdit"
              />
              <UButton
                label="保存"
                type="submit"
                :loading="saving"
                :disabled="!canSave"
              />
            </div>
          </form>
        </UCard>

        <UEmpty
          v-else
          icon="i-heroicons-academic-cap-20-solid"
          title="选择一个技能"
          description="从左侧选择技能进行查看和编辑。"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { SkillContent, SkillEditorInput, SkillImportInput, SkillProfile } from '@zakobot/shared'

const toast = useToast()

const { data, pending, error, refresh } = await useFetch<{ ok: true; data: SkillProfile[] }>('/api/skills')

const selectedId = ref<string | null>(null)
const isCreating = ref(false)
const saving = ref(false)
const uploading = ref(false)
const contentLoading = ref(false)
const uploadFile = ref<File | null>(null)
const deleteTarget = ref<SkillProfile | null>(null)
const references = ref<SkillContent['references']>([])
const requiredToolsText = ref('')
const form = reactive<SkillEditorInput>({
  name: '',
  description: '',
  content: '',
  enabled: true,
  requiredTools: [],
})

const skills = computed(() => data.value?.data ?? [])
const selectedSkill = computed(() =>
  selectedId.value ? skills.value.find(skill => skill.id === selectedId.value) ?? null : null,
)
const errorMessage = computed(() => error.value?.data?.message ?? error.value?.message ?? '')
const canSave = computed(() => form.content.trim().length > 0 && !saving.value && !contentLoading.value)
const deleteConfirmActions = computed(() => [
  {
    label: '确认删除',
    color: 'error' as const,
    loading: saving.value,
    onClick: () => deleteTarget.value && deleteSkill(deleteTarget.value),
  },
  {
    label: '取消',
    color: 'neutral' as const,
    variant: 'outline' as const,
    onClick: () => {
      deleteTarget.value = null
    },
  },
])

watch(uploadFile, (file) => {
  if (!file) {
    return
  }

  void importSkill(file)
})

watch(skills, (items) => {
  if (selectedId.value && items.some(skill => skill.id === selectedId.value)) {
    return
  }

  selectedId.value = items[0]?.id ?? null
}, { immediate: true })

watch(selectedSkill, (skill) => {
  if (!skill || isCreating.value) {
    return
  }

  void loadSkill(skill)
}, { immediate: true })

function openCreate() {
  isCreating.value = true
  selectedId.value = null
  deleteTarget.value = null
  references.value = []
  requiredToolsText.value = ''
  Object.assign(form, {
    name: '',
    description: '',
    content: '# 新技能\n\n',
    enabled: true,
    requiredTools: [],
  })
}

function selectSkill(id: string) {
  isCreating.value = false
  selectedId.value = id
  deleteTarget.value = null
}

function cancelEdit() {
  isCreating.value = false
  deleteTarget.value = null
  selectedId.value = skills.value[0]?.id ?? null
}

async function loadSkill(skill: SkillProfile) {
  contentLoading.value = true

  try {
    const response = await $fetch<{ ok: true; data: SkillContent }>(`/api/skills/${skill.id}/content`)
    form.name = skill.name
    form.description = skill.description
    form.content = response.data.content
    form.enabled = skill.enabled
    form.requiredTools = [...skill.requiredTools]
    requiredToolsText.value = skill.requiredTools.join(', ')
    references.value = response.data.references
  }
  catch (err: any) {
    toast.add({ title: err?.data?.message ?? err?.message ?? '技能内容加载失败', color: 'error' })
  }
  finally {
    contentLoading.value = false
  }
}

async function saveSkill() {
  if (!canSave.value) {
    return
  }

  saving.value = true

  try {
    const payload = toPayload()
    const response = isCreating.value
      ? await $fetch<{ ok: true; data: SkillProfile }>('/api/skills', { method: 'POST', body: payload })
      : await $fetch<{ ok: true; data: SkillProfile }>(`/api/skills/${selectedId.value}`, { method: 'PUT', body: payload })

    await refresh()
    isCreating.value = false
    selectedId.value = response.data.id
    toast.add({ title: `已保存「${response.data.name}」`, color: 'success' })
  }
  catch (err: any) {
    toast.add({ title: err?.data?.message ?? err?.message ?? '技能保存失败', color: 'error' })
  }
  finally {
    saving.value = false
  }
}

async function importSkill(file: File) {
  uploading.value = true

  try {
    const payload: SkillImportInput = {
      fileName: file.name,
      contentBase64: await fileToBase64(file),
    }

    const response = await $fetch<{ ok: true; data: SkillProfile }>('/api/skills/import', {
      method: 'POST',
      body: payload,
    })

    await refresh()
    isCreating.value = false
    selectedId.value = response.data.id
    toast.add({ title: `已导入「${response.data.name}」`, color: 'success' })
  }
  catch (err: any) {
    toast.add({ title: err?.data?.message ?? err?.message ?? '技能导入失败', color: 'error' })
  }
  finally {
    uploading.value = false
    uploadFile.value = null
  }
}

async function deleteSkill(skill: SkillProfile) {
  saving.value = true

  try {
    await $fetch<{ ok: true; data: SkillProfile }>(`/api/skills/${skill.id}`, { method: 'DELETE' })
    deleteTarget.value = null
    await refresh()
    selectedId.value = skills.value[0]?.id ?? null
    toast.add({ title: `已删除「${skill.name}」`, color: 'success' })
  }
  catch (err: any) {
    toast.add({ title: err?.data?.message ?? err?.message ?? '技能删除失败', color: 'error' })
  }
  finally {
    saving.value = false
  }
}

function toPayload(): SkillEditorInput {
  return {
    name: form.name.trim(),
    description: form.description.trim(),
    content: form.content.trim(),
    enabled: form.enabled,
    requiredTools: requiredToolsText.value
      .split(',')
      .map(item => item.trim())
      .filter(Boolean),
  }
}

async function fileToBase64(file: File) {
  const buffer = await file.arrayBuffer()
  const bytes = new Uint8Array(buffer)
  let binary = ''
  const chunkSize = 0x8000

  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.slice(index, index + chunkSize))
  }

  return btoa(binary)
}
</script>
