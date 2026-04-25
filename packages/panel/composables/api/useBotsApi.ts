import type { BotEditorInput, BotProfile } from '@zakobot/shared'

export function useBotsApi() {
  async function create(input: BotEditorInput) {
    const response = await $fetch<{ ok: true, data: BotProfile }>('/api/bots', {
      method: 'POST',
      body: input,
    })

    return response.data
  }

  async function update(id: string, input: BotEditorInput) {
    const response = await $fetch<{ ok: true, data: BotProfile }>(`/api/bots/${id}`, {
      method: 'PUT',
      body: input,
    })

    return response.data
  }

  async function remove(id: string) {
    const response = await $fetch<{ ok: true, data: BotProfile }>(`/api/bots/${id}`, {
      method: 'DELETE',
    })

    return response.data
  }

  return {
    create,
    update,
    remove,
  }
}
