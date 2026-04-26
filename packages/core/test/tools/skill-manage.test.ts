import assert from 'node:assert/strict'
import test from 'node:test'
import {
  createSkillCreateTool,
  createSkillListMineTool,
  createSkillUpdateTool,
} from '../../src/tools/builtins/skill-manage.js'
import { createTestSkillEnv } from '../helpers/create-test-skill-env.js'

test('skill_list_mine lists only agent-authored skills for the current bot', async () => {
  const env = createTestSkillEnv()

  try {
    env.manager.create({
      name: 'shared-skill',
      description: 'shared skill',
      enabled: true,
      requiredTools: [],
      content: '# Shared Skill',
    })
    env.manager.createAgentAuthored('bot-1', ['file_read'], {
      name: 'mine',
      description: 'mine',
      enabled: true,
      requiredTools: ['file_read'],
      content: '# Mine',
    })
    env.manager.createAgentAuthored('bot-2', ['file_read'], {
      name: 'other-bot',
      description: 'other',
      enabled: true,
      requiredTools: ['file_read'],
      content: '# Other',
    })

    const tool = createSkillListMineTool(env.manager, 'bot-1')
    const result = await tool.execute({})
    const content = typeof result === 'string' ? result : result.content

    assert.match(content, /mine/)
    assert.doesNotMatch(content, /shared-skill/)
    assert.doesNotMatch(content, /other-bot/)
  }
  finally {
    env.cleanup()
  }
})

test('skill_create stores a bot-local agent-authored skill', async () => {
  const env = createTestSkillEnv()

  try {
    const tool = createSkillCreateTool(env.manager, 'bot-1', ['file_read'])

    const result = await tool.execute({
      name: 'created-skill',
      description: 'Created by the bot.',
      content: '# Created Skill',
      enabled: true,
      required_tools: ['file_read'],
    })
    const content = typeof result === 'string' ? result : result.content
    const mine = env.manager.list().filter(skill => skill.ownerBotInstanceId === 'bot-1')

    assert.equal(mine.length, 1)
    assert.equal(mine[0]?.sourceType, 'agent_authored')
    assert.equal(mine[0]?.name, 'created-skill')
    assert.deepEqual(mine[0]?.requiredTools, ['file_read'])
    assert.match(content, /created-skill/)
  }
  finally {
    env.cleanup()
  }
})

test('skill_update edits an owned bot-local skill', async () => {
  const env = createTestSkillEnv()

  try {
    const created = env.manager.createAgentAuthored('bot-1', ['file_read'], {
      name: 'owned-skill',
      description: 'Initial description.',
      enabled: true,
      requiredTools: ['file_read'],
      content: '# Owned Skill',
    })
    const tool = createSkillUpdateTool(env.manager, 'bot-1', ['file_read'])

    const result = await tool.execute({
      skill_id: created.id,
      name: 'owned-skill-updated',
      description: 'Updated description.',
      content: '# Owned Skill Updated',
      enabled: true,
      required_tools: ['file_read'],
    })
    const content = typeof result === 'string' ? result : result.content
    const updated = env.manager.get(created.id)

    assert.equal(updated?.name, 'owned-skill-updated')
    assert.equal(updated?.description, 'Updated description.')
    assert.match(content, /owned-skill-updated/)
  }
  finally {
    env.cleanup()
  }
})

test('skill_update preserves existing metadata when name and description are omitted', async () => {
  const env = createTestSkillEnv()

  try {
    const created = env.manager.createAgentAuthored('bot-1', ['file_read'], {
      name: 'owned-skill',
      description: 'Initial description.',
      enabled: true,
      requiredTools: ['file_read'],
      content: `---
name: owned-skill
description: Initial description.
---

# Owned Skill

Initial body.
`,
    })
    const tool = createSkillUpdateTool(env.manager, 'bot-1', ['file_read'])

    await tool.execute({
      skill_id: created.id,
      content: '# Owned Skill\n\nUpdated body only.',
      enabled: true,
      required_tools: ['file_read'],
    })

    const updated = env.manager.get(created.id)

    assert.equal(updated?.name, 'owned-skill')
    assert.equal(updated?.description, 'Initial description.')
  }
  finally {
    env.cleanup()
  }
})

test('skill_create and skill_update keep agent-authored skills enabled even when model input says disabled', async () => {
  const env = createTestSkillEnv()

  try {
    const createTool = createSkillCreateTool(env.manager, 'bot-1', ['file_read'])
    const createdResult = await createTool.execute({
      name: 'created-skill',
      description: 'Created by the bot.',
      content: '# Created Skill',
      enabled: false,
      required_tools: ['file_read'],
    })
    const createdContent = typeof createdResult === 'string' ? createdResult : createdResult.content
    const created = env.manager.list().find(skill => skill.ownerBotInstanceId === 'bot-1')

    assert.equal(created?.enabled, true)
    assert.match(createdContent, /- enabled: true/)

    const updateTool = createSkillUpdateTool(env.manager, 'bot-1', ['file_read'])
    const updatedResult = await updateTool.execute({
      skill_id: created!.id,
      content: '# Created Skill\n\nUpdated body.',
      enabled: false,
      required_tools: ['file_read'],
    })
    const updatedContent = typeof updatedResult === 'string' ? updatedResult : updatedResult.content
    const updated = env.manager.get(created!.id)

    assert.equal(updated?.enabled, true)
    assert.match(updatedContent, /- enabled: true/)
  }
  finally {
    env.cleanup()
  }
})

test('skill_create and skill_update schemas do not expose enabled to the model', () => {
  const env = createTestSkillEnv()

  try {
    const createTool = createSkillCreateTool(env.manager, 'bot-1', ['file_read'])
    const updateTool = createSkillUpdateTool(env.manager, 'bot-1', ['file_read'])
    const createProperties = createTool.parameters.properties as Record<string, unknown>
    const updateProperties = updateTool.parameters.properties as Record<string, unknown>

    assert.equal('enabled' in createProperties, false)
    assert.equal('enabled' in updateProperties, false)
    assert.deepEqual(createTool.parameters.required, ['content'])
    assert.deepEqual(updateTool.parameters.required, ['skill_id', 'content', 'required_tools'])
  }
  finally {
    env.cleanup()
  }
})
