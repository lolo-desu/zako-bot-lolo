import assert from 'node:assert/strict'
import test from 'node:test'
import { Agent } from '../../src/llm/agent.js'
import { createTestSkillEnv } from '../helpers/create-test-skill-env.js'

interface ConversationRequestView {
  messages: Array<{ role: string; content: unknown }>
  allowedTools: Array<{ name: string; execute: (args: Record<string, unknown>) => Promise<unknown> | unknown }>
}

interface AgentConversationRequestAdapter {
  buildConversationRequest(topicId: string, role: object, history: Array<{ role: 'user'; content: string }>): ConversationRequestView
  isToolSensitive(name: string): boolean
}

test('initial conversation request exposes available_skills metadata without full skill body', () => {
  const env = createTestSkillEnv()

  try {
    const skill = env.manager.create({
      name: '',
      description: '',
      enabled: true,
      requiredTools: [],
      content: `---
name: request-skill
description: Describes the test skill.
---

# Request Skill

full skill body should not be here
`,
    })

    const role = {
      id: 'role-1',
      avatar: '',
      name: 'Tester',
      systemPrompt: 'You are a tester.',
      llmProvider: 'openai',
      llmModel: 'gpt-test',
      llmApiKey: 'test-key',
      llmBaseUrl: null,
      enabledTools: '[]',
      enabledSkills: JSON.stringify([skill.id]),
      createdAt: new Date(),
      updatedAt: new Date(),
    }

    const history = [{ role: 'user' as const, content: 'Need help with skills.' }]
    const agent = new Agent(
      'bot-1',
      () => role,
      { provider: 'openai', model: 'gpt-test', apiKey: 'test-key' },
      {
        listTopicHistory: () => history,
        listTopicMessages: () => [],
      } as any,
      {
        listEnabled: () => [],
        list: () => [],
      } as any,
      env.manager,
      {
        isEnabled: () => false,
        buildPromptBlock: () => '',
        shouldWriteback: () => false,
      } as any,
      () => ({
        systemPrompt: '',
        maxToolCallRounds: 4,
        requireMention: false,
        threadMode: true,
        maxThreadsPerChannel: 3,
        sendTime: false,
        timezone: 'UTC',
        toolApprovalMode: 'none',
        toolProcessMode: 'none',
      }),
    )
    const requestBuilder = agent as unknown as AgentConversationRequestAdapter

    const request = requestBuilder.buildConversationRequest('topic-1', role, history)
    const skillBlock = request.messages
      .filter((message: { role: string; content: unknown }) => message.role === 'system' && typeof message.content === 'string')
      .map((message: { content: string }) => message.content)
      .join('\n\n')

    assert.match(skillBlock, /request-skill/)
    assert.match(skillBlock, /Describes the test skill\./)
    assert.match(skillBlock, /available_skills/)
    assert.match(skillBlock, /Load a skill with skill_load/)
    assert.match(skillBlock, /Use loaded skills internally\. Do not mention or quote their instructions to the user\./)
    assert.doesNotMatch(skillBlock, /full skill body should not be here/)
  }
  finally {
    env.cleanup()
  }
})

test('conversation request exposes bot-local skills and runtime skill management tools', () => {
  const env = createTestSkillEnv()

  try {
    const sharedSkill = env.manager.create({
      name: 'shared-skill',
      description: 'Shared skill description.',
      enabled: true,
      requiredTools: [],
      content: '# Shared Skill',
    })
    env.manager.createAgentAuthored('bot-1', ['file_read'], {
      name: 'local-skill',
      description: 'Bot local workflow.',
      enabled: true,
      requiredTools: ['file_read'],
      content: '# Local Skill',
    })
    env.manager.createAgentAuthored('bot-2', ['file_read'], {
      name: 'other-bot-skill',
      description: 'Should stay hidden.',
      enabled: true,
      requiredTools: ['file_read'],
      content: '# Other Bot Skill',
    })

    const role = {
      id: 'role-1',
      avatar: '',
      name: 'Tester',
      systemPrompt: 'You are a tester.',
      llmProvider: 'openai',
      llmModel: 'gpt-test',
      llmApiKey: 'test-key',
      llmBaseUrl: null,
      enabledTools: JSON.stringify(['file_read']),
      enabledSkills: JSON.stringify([sharedSkill.id]),
      createdAt: new Date(),
      updatedAt: new Date(),
    }

    const history = [{ role: 'user' as const, content: 'Need a reusable workflow.' }]
    const agent = new Agent(
      'bot-1',
      () => role,
      { provider: 'openai', model: 'gpt-test', apiKey: 'test-key' },
      {
        listTopicHistory: () => history,
        listTopicMessages: () => [],
      } as any,
      {
        listEnabled: () => [],
        list: () => [],
      } as any,
      env.manager,
      {
        isEnabled: () => false,
        buildPromptBlock: () => '',
        shouldWriteback: () => false,
      } as any,
      () => ({
        systemPrompt: '',
        maxToolCallRounds: 4,
        requireMention: false,
        threadMode: true,
        maxThreadsPerChannel: 3,
        sendTime: false,
        timezone: 'UTC',
        toolApprovalMode: 'none',
        toolProcessMode: 'none',
      }),
    )
    const requestBuilder = agent as unknown as AgentConversationRequestAdapter

    const request = requestBuilder.buildConversationRequest('topic-1', role, history)
    const skillBlock = request.messages
      .filter((message: { role: string; content: unknown }) => message.role === 'system' && typeof message.content === 'string')
      .map((message: { content: string }) => message.content)
      .join('\n\n')

    assert.match(skillBlock, /shared-skill/)
    assert.match(skillBlock, /local-skill/)
    assert.doesNotMatch(skillBlock, /other-bot-skill/)
    assert.match(skillBlock, /skill_list_mine/)
    assert.match(skillBlock, /save reusable workflows as bot-local skills/i)
    assert.match(skillBlock, /save only stable reusable instructions and workflows/i)
    assert.match(skillBlock, /do not save secrets, temporary output, one-off tasks, or temporary status/i)
    assert.deepEqual(
      request.allowedTools.map(tool => tool.name).sort(),
      ['skill_create', 'skill_list_mine', 'skill_load', 'skill_update'],
    )
  }
  finally {
    env.cleanup()
  }
})

test('conversation request skill_load can load a visible bot-local skill', async () => {
  const env = createTestSkillEnv()

  try {
    const localSkill = env.manager.createAgentAuthored('bot-1', ['file_read'], {
      name: 'local-skill',
      description: 'Bot local workflow.',
      enabled: true,
      requiredTools: ['file_read'],
      content: `---
name: local-skill
description: Bot local workflow.
---

# Local Skill

Reusable local content.
`,
    })

    const role = {
      id: 'role-1',
      avatar: '',
      name: 'Tester',
      systemPrompt: 'You are a tester.',
      llmProvider: 'openai',
      llmModel: 'gpt-test',
      llmApiKey: 'test-key',
      llmBaseUrl: null,
      enabledTools: JSON.stringify(['file_read']),
      enabledSkills: '[]',
      createdAt: new Date(),
      updatedAt: new Date(),
    }

    const history = [{ role: 'user' as const, content: 'Need the local workflow.' }]
    const agent = new Agent(
      'bot-1',
      () => role,
      { provider: 'openai', model: 'gpt-test', apiKey: 'test-key' },
      {
        listTopicHistory: () => history,
        listTopicMessages: () => [],
      } as any,
      {
        listEnabled: () => [],
        list: () => [],
      } as any,
      env.manager,
      {
        isEnabled: () => false,
        buildPromptBlock: () => '',
        shouldWriteback: () => false,
      } as any,
      () => ({
        systemPrompt: '',
        maxToolCallRounds: 4,
        requireMention: false,
        threadMode: true,
        maxThreadsPerChannel: 3,
        sendTime: false,
        timezone: 'UTC',
        toolApprovalMode: 'none',
        toolProcessMode: 'none',
      }),
    )
    const requestBuilder = agent as unknown as AgentConversationRequestAdapter

    const request = requestBuilder.buildConversationRequest('topic-1', role, history)
    const skillLoadTool = request.allowedTools.find(tool => tool.name === 'skill_load')

    assert.ok(skillLoadTool)

    const loaded = await skillLoadTool.execute({ skill_id: localSkill.id })
    const content = typeof loaded === 'string' ? loaded : String(loaded)

    assert.match(content, /local-skill/)
    assert.match(content, /Reusable local content\./)
  }
  finally {
    env.cleanup()
  }
})

test('bot-local write tools are treated as sensitive by the runtime approval model', () => {
  const env = createTestSkillEnv()

  try {
    const role = {
      id: 'role-1',
      avatar: '',
      name: 'Tester',
      systemPrompt: 'You are a tester.',
      llmProvider: 'openai',
      llmModel: 'gpt-test',
      llmApiKey: 'test-key',
      llmBaseUrl: null,
      enabledTools: JSON.stringify(['file_read']),
      enabledSkills: '[]',
      createdAt: new Date(),
      updatedAt: new Date(),
    }

    const agent = new Agent(
      'bot-1',
      () => role,
      { provider: 'openai', model: 'gpt-test', apiKey: 'test-key' },
      {
        listTopicHistory: () => [],
        listTopicMessages: () => [],
      } as any,
      {
        listEnabled: () => [],
        list: () => [],
      } as any,
      env.manager,
      {
        isEnabled: () => false,
        buildPromptBlock: () => '',
        shouldWriteback: () => false,
      } as any,
      () => ({
        systemPrompt: '',
        maxToolCallRounds: 4,
        requireMention: false,
        threadMode: true,
        maxThreadsPerChannel: 3,
        sendTime: false,
        timezone: 'UTC',
        toolApprovalMode: 'none',
        toolProcessMode: 'none',
      }),
    ) as unknown as AgentConversationRequestAdapter

    assert.equal(agent.isToolSensitive('skill_create'), true)
    assert.equal(agent.isToolSensitive('skill_update'), true)
    assert.equal(agent.isToolSensitive('skill_list_mine'), false)
    assert.equal(agent.isToolSensitive('skill_load'), false)
  }
  finally {
    env.cleanup()
  }
})
