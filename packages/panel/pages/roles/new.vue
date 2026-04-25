<template>
  <RoleEditorForm
    title="新建角色"
    description="先把角色基础资料录进去，后续再继续扩展能力配置。"
    submit-label="创建角色"
    :initial-value="form"
    :pending="pending"
    @submit="handleSubmit"
  />
</template>

<script setup lang="ts">
import { createDefaultRoleEditorInput } from '@zakobot/shared'
import type { RoleEditorInput, RoleProfile } from '@zakobot/shared'

const toast = useToast()

const pending = ref(false)
const form: RoleEditorInput = createDefaultRoleEditorInput()

async function handleSubmit(payload: RoleEditorInput) {
  pending.value = true

  try {
    const created = await $fetch<{ ok: true, data: RoleProfile }>('/api/roles', {
      method: 'POST',
      body: payload,
    })

    toast.add({ title: `已创建角色「${created.data.name}」`, color: 'success' })
    await navigateTo(`/roles/${created.data.id}`)
  }
  catch (error: any) {
    toast.add({
      title: error?.data?.message ?? error?.message ?? '创建角色失败',
      color: 'error',
    })
  }
  finally {
    pending.value = false
  }
}
</script>
