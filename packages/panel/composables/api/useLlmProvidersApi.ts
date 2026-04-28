import type { LlmProviderEditorInput, LlmProviderProfile } from '@zakobot/shared'

type FetchModelsResponse = {
  models: string[]
  provider: LlmProviderProfile
}

export function useLlmProvidersApi() {
  async function list() {
    const response = await $fetch<{ ok: true, data: LlmProviderProfile[] }>('/api/llm-providers')
    return response.data
  }

  async function create(input: LlmProviderEditorInput) {
    const response = await $fetch<{ ok: true, data: LlmProviderProfile }>('/api/llm-providers', {
      method: 'POST',
      body: input,
    })

    return response.data
  }

  async function update(id: string, input: LlmProviderEditorInput) {
    const response = await $fetch<{ ok: true, data: LlmProviderProfile }>(`/api/llm-providers/${id}`, {
      method: 'PUT',
      body: input,
    })

    return response.data
  }

  async function remove(id: string) {
    const response = await $fetch<{ ok: true, data: LlmProviderProfile }>(`/api/llm-providers/${id}`, {
      method: 'DELETE',
    })

    return response.data
  }

  async function fetchModels(id: string) {
    const response = await $fetch<{ ok: true, data: FetchModelsResponse }>(`/api/llm-providers/${id}/fetch-models`, {
      method: 'POST',
    })

    return response.data
  }

  return {
    list,
    create,
    update,
    remove,
    fetchModels,
  }
}
