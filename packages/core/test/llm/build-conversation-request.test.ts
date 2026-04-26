import assert from 'node:assert/strict'
import test from 'node:test'
import { Agent } from '../../src/llm/agent.js'
import { createTestSkillEnv } from '../helpers/create-test-skill-env.js'

interface ConversationRequestView {
  messages: Array<{ role: string; content: unknown }>
}

interface AgentConversationRequestAdapter {
  buildConversationRequest(topicId: string, role: object, history: Array<{ role: 'user'; content: string }>): ConversationRequestView
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
