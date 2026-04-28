import {
  BUILTIN_LLM_PROVIDER_TEMPLATES,
  isTask4BotSelectableProvider,
} from '@zakobot/shared'
import type { LlmProviderEditorInput, LlmProviderFormat, LlmProviderProfile } from '@zakobot/shared'
import { useLlmProvidersApi } from './api/useLlmProvidersApi'
import { refreshModelPlatformsSafely } from './modelPlatforms-load'

export type ApiFormat = LlmProviderFormat

export interface ModelPlatform {
  id: string
  name: string
  format: ApiFormat
  baseUrl: string
  defaultBaseUrl: string
  apiKey: string
  enabled: boolean
  enabledModels: string[]
  disabledModels: string[]
  region?: string
  builtin?: boolean
}

export interface Task4BotModelOption {
  label: string
  value: string
  apiKey: string
  baseUrl: string
  model: string
  providerId: string
  platformName: string
}

export function getTask4BotModelOptions(platforms: ModelPlatform[]): Task4BotModelOption[] {
  return platforms
    .filter(platform => isTask4BotSelectableProvider(platform))
    .flatMap(platform =>
      platform.enabledModels.map(model => ({
        label: `${platform.name}-${model}`,
        value: `${platform.id}::${model}`,
        apiKey: platform.apiKey,
        baseUrl: platform.baseUrl,
        model,
        providerId: platform.id,
        platformName: platform.name,
      })),
    )
}

export function isTask4BotModelSelectionUsable(selectedValue: string, options: Task4BotModelOption[], allowLegacyFallback = false) {
  return options.some(option => option.value === selectedValue)
    || (allowLegacyFallback && selectedValue.startsWith('saved::legacy::'))
}

function toModelPlatform(provider: LlmProviderProfile): ModelPlatform {
  const builtin = provider.builtin
    ? BUILTIN_LLM_PROVIDER_TEMPLATES.find(item => item.name === provider.name && item.format === provider.format)
    : undefined

  return {
    id: provider.id,
    name: provider.name,
    format: provider.format,
    baseUrl: provider.baseUrl,
    defaultBaseUrl: builtin?.defaultBaseUrl ?? provider.baseUrl,
    apiKey: provider.apiKey,
    enabled: provider.enabled,
    enabledModels: [...provider.enabledModels],
    disabledModels: [...provider.disabledModels],
    region: provider.region,
    builtin: provider.builtin,
  }
}

function toEditorInput(platform: ModelPlatform): LlmProviderEditorInput {
  return {
    name: platform.name,
    format: platform.format,
    baseUrl: platform.baseUrl,
    apiKey: platform.apiKey,
    enabled: platform.enabled,
    enabledModels: [...platform.enabledModels],
    disabledModels: [...platform.disabledModels],
    region: platform.region ?? '',
    builtin: Boolean(platform.builtin),
  }
}

export function useModelPlatforms() {
  const api = useLlmProvidersApi()
  const platforms = useState<ModelPlatform[]>('llm-provider-platforms', () => [])
  const loaded = useState('llm-provider-platforms-loaded', () => false)

  function replacePlatform(provider: LlmProviderProfile) {
    const next = toModelPlatform(provider)
    const index = platforms.value.findIndex(platform => platform.id === provider.id)

    if (index === -1) {
      platforms.value = [...platforms.value, next]
      return next
    }

    platforms.value = platforms.value.map((platform, platformIndex) =>
      platformIndex === index ? next : platform,
    )
    return next
  }

  function getPlatform(id: string) {
    return platforms.value.find(platform => platform.id === id)
  }

  onMounted(() => {
    if (!loaded.value) {
      void refreshModelPlatformsSafely(refresh)
    }
  })

  async function refresh() {
    const providers = await api.list()
    platforms.value = providers.map(toModelPlatform)
    loaded.value = true
  }

  async function addPlatform(name: string, format: ApiFormat): Promise<ModelPlatform> {
    const created = await api.create({
      name,
      format,
      baseUrl: '',
      apiKey: '',
      enabled: false,
      enabledModels: [],
      disabledModels: [],
      region: '',
      builtin: false,
    })

    loaded.value = true
    return replacePlatform(created)
  }

  async function updatePlatform(id: string, patch: Partial<Omit<ModelPlatform, 'id'>>) {
    const platform = getPlatform(id)
    if (!platform) return

    const updated = await api.update(id, toEditorInput({
      ...platform,
      ...patch,
      defaultBaseUrl: patch.defaultBaseUrl ?? platform.defaultBaseUrl,
    }))

    loaded.value = true
    return replacePlatform(updated)
  }

  async function removePlatform(id: string) {
    const platform = getPlatform(id)
    if (platform?.builtin) return

    const removed = await api.remove(id)
    platforms.value = platforms.value.filter(item => item.id !== id)
    loaded.value = true
    return toModelPlatform(removed)
  }

  async function togglePlatformEnabled(id: string) {
    const platform = getPlatform(id)
    if (!platform) return

    return updatePlatform(id, { enabled: !platform.enabled })
  }

  async function enableModel(platformId: string, model: string) {
    const platform = getPlatform(platformId)
    if (!platform) return

    return updatePlatform(platformId, {
      enabledModels: platform.enabledModels.includes(model)
        ? platform.enabledModels
        : [...platform.enabledModels, model],
      disabledModels: platform.disabledModels.filter(item => item !== model),
    })
  }

  async function disableModel(platformId: string, model: string) {
    const platform = getPlatform(platformId)
    if (!platform) return

    return updatePlatform(platformId, {
      enabledModels: platform.enabledModels.filter(item => item !== model),
      disabledModels: platform.disabledModels.includes(model)
        ? platform.disabledModels
        : [...platform.disabledModels, model],
    })
  }

  async function addCustomModel(platformId: string, model: string) {
    const platform = getPlatform(platformId)
    if (!platform) return
    if (platform.enabledModels.includes(model) || platform.disabledModels.includes(model)) return

    return updatePlatform(platformId, {
      enabledModels: [...platform.enabledModels, model],
    })
  }

  async function removeModel(platformId: string, model: string) {
    const platform = getPlatform(platformId)
    if (!platform) return

    return updatePlatform(platformId, {
      enabledModels: platform.enabledModels.filter(item => item !== model),
      disabledModels: platform.disabledModels.filter(item => item !== model),
    })
  }

  async function fetchModels(id: string): Promise<string[]> {
    const platform = getPlatform(id)
    if (!platform) throw new Error('未找到对应平台')
    if (platform.format === 'vertex') throw new Error('Vertex AI 不支持拉取模型列表')

    const result = await api.fetchModels(id)
    loaded.value = true
    replacePlatform(result.provider)
    return result.models
  }

  return {
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
  }
}
