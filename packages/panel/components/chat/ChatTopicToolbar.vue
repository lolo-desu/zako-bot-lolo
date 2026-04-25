<template>
  <div class="grid gap-3 lg:grid-cols-[18rem_minmax(0,1fr)_auto]">
    <UFormField label="机器人" name="bot">
      <USelect
        :model-value="selectedBotId"
        class="w-full"
        :items="botOptions"
        :disabled="botsPending || !botOptions.length"
        placeholder="选择机器人"
        @update:model-value="emit('update:selectedBotId', String($event ?? ''))"
      />
    </UFormField>

    <UFormField label="话题" name="topic">
      <USelect
        :model-value="selectedTopicId"
        class="w-full"
        :items="topicOptions"
        :disabled="topicsPending || !selectedBotId || !topicOptions.length"
        placeholder="选择话题"
        @update:model-value="emit('update:selectedTopicId', String($event ?? ''))"
      />
    </UFormField>

    <div class="flex items-end">
      <div class="flex flex-wrap gap-2">
        <UButton
          label="新建话题"
          icon="i-heroicons-plus-20-solid"
          :loading="creatingTopic"
          :disabled="!selectedBotId || creatingTopic || deletingTopic"
          @click="emit('createTopic')"
        />
        <UButton
          label="删除话题"
          color="error"
          variant="outline"
          icon="i-heroicons-trash-20-solid"
          :loading="deletingCurrentTopic"
          :disabled="!hasSelectedTopic || creatingTopic || deletingTopic"
          @click="emit('deleteTopic')"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
type SelectOption = {
  label: string
  value: string
}

defineProps<{
  selectedBotId: string
  selectedTopicId: string
  botOptions: SelectOption[]
  topicOptions: SelectOption[]
  botsPending: boolean
  topicsPending: boolean
  creatingTopic: boolean
  deletingTopic: boolean
  deletingCurrentTopic: boolean
  hasSelectedTopic: boolean
}>()

const emit = defineEmits<{
  'update:selectedBotId': [value: string]
  'update:selectedTopicId': [value: string]
  createTopic: []
  deleteTopic: []
}>()
</script>
