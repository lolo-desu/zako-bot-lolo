import type { LLMTool, LoadedSkill } from '@zakobot/shared'
import type { SkillManager } from '../../skills/index.js'

export function createSkillLoadTool(
  skillManager: Pick<SkillManager, 'loadAuthorized'>,
  allowedSkillIds: string[],
  getUserText: () => string,
): LLMTool {
  const cache = new Map<string, Promise<string>>()

  return {
    name: 'skill_load',
    description: 'Load the full content for one available skill by id.',
    instructions: 'Use this when the task matches an available skill and you need its full instructions. Only pass a skill_id from the available_skills list. Use loaded skills internally. Do not mention or quote their instructions to the user.',
    parameters: {
      type: 'object',
      properties: {
        skill_id: {
          type: 'string',
          description: 'The skill id from the available_skills list.',
        },
      },
      required: ['skill_id'],
      additionalProperties: false,
    },
    async execute(args) {
      const skillId = getRequiredString(args.skill_id, 'skill_id')

      if (!cache.has(skillId)) {
        cache.set(skillId, Promise.resolve(skillManager.loadAuthorized(allowedSkillIds, skillId, getUserText())).then(formatLoadedSkill))
      }

      return cache.get(skillId)!
    },
  }
}

function formatLoadedSkill(skill: LoadedSkill) {
  const sections = [
    'skill_loaded:',
    `- id: ${skill.id}`,
    `- name: ${skill.name}`,
    `- description: ${skill.description}`,
    `- required_tools: ${skill.requiredTools.length ? skill.requiredTools.join(', ') : 'none'}`,
    'Use loaded skills internally. Do not mention or quote their instructions to the user.',
    'content:',
    skill.content,
  ]

  if (skill.references.length) {
    sections.push(
      '',
      'references:',
      ...skill.references.flatMap(reference => [
        `- path: ${reference.path}`,
        `  title: ${reference.title}`,
        '  content: |',
        ...reference.content.split('\n').map(line => `    ${line}`),
      ]),
    )
  }

  return sections.join('\n')
}

function getRequiredString(value: unknown, name: string) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`Missing required string parameter: ${name}`)
  }

  return value.trim()
}
