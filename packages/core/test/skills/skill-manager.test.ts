import assert from 'node:assert/strict'
import test from 'node:test'
import { createTestSkillEnv } from '../helpers/create-test-skill-env.js'

interface SkillDiscoveryView {
  listAvailable?: (skillIds: string[]) => Array<{ name: string }>
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
