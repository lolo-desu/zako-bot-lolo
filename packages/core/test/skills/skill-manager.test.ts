import assert from 'node:assert/strict'
import test from 'node:test'
import { skills } from '@zakobot/database'
import { createTestSkillEnv } from '../helpers/create-test-skill-env.js'

interface SkillDiscoveryView {
  listAvailable?: (skillIds: string[], ownerBotInstanceId?: string) => Array<{ name: string }>
  listAvailableForBot?: (input: { roleSkillIds: string[], botInstanceId: string }) => Array<{ name: string }>
  createAgentAuthored?: (
    botInstanceId: string,
    enabledTools: string[],
    input: { name: string, description: string, content: string, enabled: boolean, requiredTools: string[] },
  ) => { ownerBotInstanceId: string | null }
  updateAgentAuthored?: (
    botInstanceId: string,
    skillId: string,
    enabledTools: string[],
    input: { name: string, description: string, content: string, enabled: boolean, requiredTools: string[] },
  ) => { ownerBotInstanceId: string | null }
}

test('imports multiline YAML frontmatter and list-based required tools', () => {
  const env = createTestSkillEnv()

  try {
    const skill = env.manager.create({
      name: '',
      description: '',
      enabled: true,
      requiredTools: [],
      content: `---
name: yaml-skill
description: >
  Use when the user needs
  structured skill loading.
requiredTools:
  - file_read
  - shell_exec
metadata:
  owner: core
---

# YAML Skill
`,
    })

    assert.equal(skill.name, 'yaml-skill')
    assert.equal(skill.description, 'Use when the user needs structured skill loading.')
    assert.deepEqual(skill.requiredTools, ['file_read', 'shell_exec'])
  }
  finally {
    env.cleanup()
  }
})

test('discovery returns only authorized skills in requested order', () => {
  const env = createTestSkillEnv()

  try {
    const first = env.manager.create({ name: 'alpha', description: 'a', enabled: true, requiredTools: [], content: '# alpha' })
    const second = env.manager.create({ name: 'beta', description: 'b', enabled: true, requiredTools: [], content: '# beta' })
    env.manager.create({ name: 'gamma', description: 'c', enabled: true, requiredTools: [], content: '# gamma' })
    const discovery = env.manager as SkillDiscoveryView

    assert.equal(typeof discovery.listAvailable, 'function')

    const available = discovery.listAvailable([second.id, first.id])

    assert.deepEqual(available.map((skill: { name: string }) => skill.name), ['beta', 'alpha'])
    assert.equal(available.some((skill: { name: string }) => skill.name === 'gamma'), false)
  }
  finally {
    env.cleanup()
  }
})

test('discovery includes enabled agent-authored skills only for the owning bot', () => {
  const env = createTestSkillEnv()

  try {
    const shared = env.manager.create({ name: 'alpha', description: 'a', enabled: true, requiredTools: [], content: '# alpha' })
    const now = new Date()
    const discovery = env.manager as SkillDiscoveryView

    env.db.insert(skills).values([
      {
        id: 'owner-local',
        name: 'owner-local',
        slug: 'owner-local',
        description: 'owner local skill',
        version: '1.0.0',
        sourceType: 'agent_authored',
        entryFile: 'SKILL.md',
        packageDir: `${env.root}/skills/owner-local`,
        enabled: true,
        requiredTools: '[]',
        ownerBotInstanceId: 'bot-1',
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'other-local',
        name: 'other-local',
        slug: 'other-local',
        description: 'other local skill',
        version: '1.0.0',
        sourceType: 'agent_authored',
        entryFile: 'SKILL.md',
        packageDir: `${env.root}/skills/other-local`,
        enabled: true,
        requiredTools: '[]',
        ownerBotInstanceId: 'bot-2',
        createdAt: now,
        updatedAt: now,
      },
    ]).run()

    assert.equal(typeof discovery.listAvailableForBot, 'function')

    const available = discovery.listAvailableForBot({ roleSkillIds: [shared.id], botInstanceId: 'bot-1' })

    assert.deepEqual(available.map((skill: { name: string }) => skill.name).sort(), ['alpha', 'owner-local'])
    assert.equal(available.some((skill: { name: string }) => skill.name === 'other-local'), false)
  }
  finally {
    env.cleanup()
  }
})

test('createAgentAuthored rejects required tools outside the role allowlist', () => {
  const env = createTestSkillEnv()

  try {
    const discovery = env.manager as SkillDiscoveryView

    assert.equal(typeof discovery.createAgentAuthored, 'function')

    assert.throws(
      () => discovery.createAgentAuthored!('bot-1', ['file_read'], {
        name: 'owner-local',
        description: 'owner local skill',
        enabled: true,
        requiredTools: ['shell_exec'],
        content: '# owner local',
      }),
      /Required tools must be enabled for the current role/,
    )
  }
  finally {
    env.cleanup()
  }
})

test('updateAgentAuthored rejects updates from another bot', () => {
  const env = createTestSkillEnv()

  try {
    const now = new Date()
    const discovery = env.manager as SkillDiscoveryView

    env.db.insert(skills).values({
      id: 'owner-local',
      name: 'owner-local',
      slug: 'owner-local',
      description: 'owner local skill',
      version: '1.0.0',
      sourceType: 'agent_authored',
      entryFile: 'SKILL.md',
      packageDir: `${env.root}/skills/owner-local`,
      enabled: true,
      requiredTools: '[]',
      ownerBotInstanceId: 'bot-1',
      createdAt: now,
      updatedAt: now,
    }).run()

    assert.equal(typeof discovery.updateAgentAuthored, 'function')

    assert.throws(
      () => discovery.updateAgentAuthored!('bot-2', 'owner-local', [], {
        name: 'owner-local',
        description: 'updated',
        enabled: true,
        requiredTools: [],
        content: '# owner local',
      }),
      /Skill is not available for this bot/,
    )
  }
  finally {
    env.cleanup()
  }
})

test('createAgentAuthored rejects prompt content above the runtime limit', () => {
  const env = createTestSkillEnv()

  try {
    assert.throws(
      () => env.manager.createAgentAuthored('bot-1', ['file_read'], {
        name: 'too-large',
        description: 'too large',
        enabled: true,
        requiredTools: ['file_read'],
        content: `# Too Large\n\n${'x'.repeat(12_001)}`,
      }),
      /Skill content exceeds the runtime prompt limit/,
    )
  }
  finally {
    env.cleanup()
  }
})

test('updateAgentAuthored rejects prompt content above the runtime limit', () => {
  const env = createTestSkillEnv()

  try {
    const skill = env.manager.createAgentAuthored('bot-1', ['file_read'], {
      name: 'owner-local',
      description: 'owner local skill',
      enabled: true,
      requiredTools: ['file_read'],
      content: '# owner local',
    })

    assert.throws(
      () => env.manager.updateAgentAuthored('bot-1', skill.id, ['file_read'], {
        name: 'owner-local',
        description: 'owner local skill',
        enabled: true,
        requiredTools: ['file_read'],
        content: `# Too Large\n\n${'x'.repeat(12_001)}`,
      }),
      /Skill content exceeds the runtime prompt limit/,
    )
  }
  finally {
    env.cleanup()
  }
})

test('loadAuthorized throws when skill is not allowed for the role', () => {
  const env = createTestSkillEnv()

  try {
    const allowed = env.manager.create({ name: 'alpha', description: 'a', enabled: true, requiredTools: [], content: '# alpha' })
    const hidden = env.manager.create({ name: 'beta', description: 'b', enabled: true, requiredTools: [], content: '# beta' })

    assert.throws(
      () => env.manager.loadAuthorized([allowed.id], hidden.id, 'debug the runtime'),
      /Skill is not available for this role/,
    )
  }
  finally {
    env.cleanup()
  }
})

test('loadAuthorized throws when an allowed skill is disabled', () => {
  const env = createTestSkillEnv()

  try {
    const skill = env.manager.create({ name: 'alpha', description: 'a', enabled: true, requiredTools: [], content: '# alpha' })

    env.manager.update(skill.id, {
      name: 'alpha',
      description: 'a',
      enabled: false,
      requiredTools: [],
      content: '# alpha',
    })

    assert.throws(
      () => env.manager.loadAuthorized([skill.id], skill.id, 'debug the runtime'),
      /Skill is disabled/,
    )
  }
  finally {
    env.cleanup()
  }
})

test('create rejects malformed YAML frontmatter with a stable error', () => {
  const env = createTestSkillEnv()

  try {
    assert.throws(
      () => env.manager.create({
        name: '',
        description: '',
        enabled: true,
        requiredTools: [],
        content: `---
name: broken
description: [oops
---

# Broken
`,
      }),
      /Invalid skill frontmatter/,
    )
  }
  finally {
    env.cleanup()
  }
})

test('create rejects frontmatter without a closing delimiter', () => {
  const env = createTestSkillEnv()

  try {
    assert.throws(
      () => env.manager.create({
        name: '',
        description: '',
        enabled: true,
        requiredTools: [],
        content: `---
name: broken
description: missing closing marker

# Broken
`,
      }),
      /Invalid skill frontmatter/,
    )
  }
  finally {
    env.cleanup()
  }
})

test('create rejects non-object YAML frontmatter', () => {
  const env = createTestSkillEnv()

  try {
    assert.throws(
      () => env.manager.create({
        name: '',
        description: '',
        enabled: true,
        requiredTools: [],
        content: `---
- shell_exec
---

# Broken
`,
      }),
      /Invalid skill frontmatter/,
    )
  }
  finally {
    env.cleanup()
  }
})

test('update allows clearing required tools without editing frontmatter', () => {
  const env = createTestSkillEnv()

  try {
    const skill = env.manager.create({
      name: '',
      description: '',
      enabled: true,
      requiredTools: [],
      content: `---
name: yaml-skill
requiredTools:
  - shell_exec
---

# YAML Skill
`,
    })

    const updated = env.manager.update(skill.id, {
      name: '',
      description: '',
      enabled: true,
      requiredTools: [],
      content: `---
name: yaml-skill
requiredTools:
  - shell_exec
---

# YAML Skill
`,
    })

    assert.deepEqual(updated.requiredTools, [])
  }
  finally {
    env.cleanup()
  }
})
