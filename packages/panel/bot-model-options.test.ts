import assert from 'node:assert/strict'
import test from 'node:test'
import * as modelPlatforms from './composables/modelPlatforms'

test('getTask4BotModelOptions only returns enabled providers with bridge-compatible runtime config', () => {
  assert.equal(typeof modelPlatforms.getTask4BotModelOptions, 'function')

  const options = modelPlatforms.getTask4BotModelOptions([
    {
      id: 'provider-openai',
      name: 'OpenAI Ready',
      format: 'openai',
      baseUrl: 'https://api.openai.com',
      defaultBaseUrl: 'https://api.openai.com',
      apiKey: 'secret',
      enabled: true,
      enabledModels: ['gpt-4o'],
      disabledModels: [],
    },
    {
      id: 'provider-google',
      name: 'Google AI Studio',
      format: 'google',
      baseUrl: 'https://generativelanguage.googleapis.com',
      defaultBaseUrl: 'https://generativelanguage.googleapis.com',
      apiKey: 'secret',
      enabled: true,
      enabledModels: ['gemini-2.5-pro'],
      disabledModels: [],
    },
    {
      id: 'provider-disabled',
      name: 'Disabled Provider',
      format: 'openai',
      baseUrl: 'https://provider.example',
      defaultBaseUrl: 'https://provider.example',
      apiKey: 'secret',
      enabled: false,
      enabledModels: ['gpt-4.1'],
      disabledModels: [],
    },
    {
      id: 'provider-incomplete',
      name: 'Incomplete Provider',
      format: 'openai',
      baseUrl: '',
      defaultBaseUrl: 'https://provider.example',
      apiKey: '',
      enabled: true,
      enabledModels: ['gpt-4.1-mini'],
      disabledModels: [],
    },
  ])

  assert.deepEqual(options, [
    {
      label: 'OpenAI Ready-gpt-4o',
      value: 'provider-openai::gpt-4o',
      apiKey: 'secret',
      baseUrl: 'https://api.openai.com',
      model: 'gpt-4o',
      providerId: 'provider-openai',
      platformName: 'OpenAI Ready',
    },
  ])
})

test('getTask4BotModelOptions excludes vertex providers even when runtime config looks complete', () => {
  const options = modelPlatforms.getTask4BotModelOptions([
    {
      id: 'provider-vertex-valid',
      name: 'Vertex Valid',
      format: 'vertex',
      baseUrl: 'https://us-central1-aiplatform.googleapis.com/v1beta1/projects/test-project/locations/us-central1/endpoints/openapi',
      defaultBaseUrl: 'https://aiplatform.googleapis.com',
      apiKey: JSON.stringify({
        type: 'service_account',
        project_id: 'test-project',
        private_key: '-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----\n',
        client_email: 'bot@test-project.iam.gserviceaccount.com',
      }),
      enabled: true,
      enabledModels: ['gemini-2.5-flash'],
      disabledModels: [],
    },
  ])

  assert.deepEqual(options, [])
})

test('getTask4BotModelOptions excludes openai-labeled providers when apiKey is Vertex service-account JSON', () => {
  const options = modelPlatforms.getTask4BotModelOptions([
    {
      id: 'provider-openai-vertex-creds',
      name: 'OpenAI Label With Vertex Creds',
      format: 'openai',
      baseUrl: 'https://provider.example',
      defaultBaseUrl: 'https://provider.example',
      apiKey: JSON.stringify({
        type: 'service_account',
        project_id: 'test-project',
        private_key: '-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----\n',
        client_email: 'bot@test-project.iam.gserviceaccount.com',
      }),
      enabled: true,
      enabledModels: ['gpt-4.1'],
      disabledModels: [],
    },
  ])

  assert.deepEqual(options, [])
})

test('isTask4BotModelSelectionUsable rejects fallback-only selections', () => {
  const options = [
    {
      label: 'OpenAI Ready-gpt-4o',
      value: 'provider-openai::gpt-4o',
      apiKey: 'secret',
      baseUrl: 'https://api.openai.com',
      model: 'gpt-4o',
      providerId: 'provider-openai',
      platformName: 'OpenAI Ready',
    },
  ]

  assert.equal(modelPlatforms.isTask4BotModelSelectionUsable('provider-openai::gpt-4o', options), true)
  assert.equal(modelPlatforms.isTask4BotModelSelectionUsable('saved::provider-openai::gpt-4o', options), false)
  assert.equal(modelPlatforms.isTask4BotModelSelectionUsable('saved::legacy::Google AI Studio::gemini-2.5-pro', options), false)
  assert.equal(modelPlatforms.isTask4BotModelSelectionUsable('saved::legacy::Google AI Studio::gemini-2.5-pro', options, true), true)
})
