import type { LLMTool, SkillProfile } from '@zakobot/shared'
import type { SkillManager } from '../../skills/index.js'

export function createSkillListMineTool(
  skillManager: Pick<SkillManager, 'list'>,
  botInstanceId: string,
): LLMTool {
  return {
    name: 'skill_list_mine',
    description: 'List this bot\'s saved local reusable skills.',
    instructions: 'Check this before creating a new local skill so you can reuse or update an existing workflow instead of duplicating it.',
    parameters: {
      type: 'object',
      properties: {},
      additionalProperties: false,
    },
    execute: async () => {
      const skills = skillManager.list()
        .filter(skill => skill.sourceType === 'agent_authored' && skill.ownerBotInstanceId === botInstanceId)

      if (skills.length === 0) {
        return 'my_skills:\n- none'
      }

      return [
        'my_skills:',
        ...skills.map(formatSkillProfile),
      ].join('\n')
    },
  }
}

export function createSkillCreateTool(
  skillManager: Pick<SkillManager, 'createAgentAuthored'>,
  botInstanceId: string,
  enabledTools: string[],
): LLMTool {
  return {
    name: 'skill_create',
    description: 'Save a new bot-local reusable skill.',
    sensitive: true,
    instructions: 'Use this when you discover a reusable workflow that should be saved for this bot to use again later.',
    parameters: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'Display name for the skill.',
        },
        description: {
          type: 'string',
          description: 'Short summary of when to use the skill.',
        },
        content: {
          type: 'string',
          description: 'Full Markdown content for the skill body.',
        },
        required_tools: {
          type: 'array',
          description: 'Tool names the skill depends on. These must already be enabled for the current role.',
          items: { type: 'string' },
        },
      },
      required: ['content'],
      additionalProperties: false,
    },
    execute: async (args) => {
      const created = skillManager.createAgentAuthored(botInstanceId, enabledTools, {
        name: getOptionalString(args.name),
        description: getOptionalString(args.description),
        content: getRequiredString(args.content, 'content'),
        enabled: true,
        requiredTools: getStringArray(args.required_tools),
      })

      return formatSavedSkill('skill_created', created)
    },
  }
}

export function createSkillUpdateTool(
  skillManager: Pick<SkillManager, 'get' | 'updateAgentAuthored'>,
  botInstanceId: string,
  enabledTools: string[],
): LLMTool {
  return {
    name: 'skill_update',
    description: 'Update one existing bot-local reusable skill.',
    sensitive: true,
    instructions: 'Use this to improve or correct a saved local skill after checking skill_list_mine. Pass the full desired state for the workflow content and required_tools.',
    parameters: {
      type: 'object',
      properties: {
        skill_id: {
          type: 'string',
          description: 'The id of the bot-local skill to update.',
        },
        name: {
          type: 'string',
          description: 'Updated display name for the skill.',
        },
        description: {
          type: 'string',
          description: 'Updated short summary of when to use the skill.',
        },
        content: {
          type: 'string',
          description: 'Updated full Markdown content for the skill body.',
        },
        required_tools: {
          type: 'array',
          description: 'Updated tool names the skill depends on. These must already be enabled for the current role.',
          items: { type: 'string' },
        },
      },
      required: ['skill_id', 'content', 'required_tools'],
      additionalProperties: false,
    },
    execute: async (args) => {
      const skillId = getRequiredString(args.skill_id, 'skill_id')
      const existing = skillManager.get(skillId)
      const updated = skillManager.updateAgentAuthored(botInstanceId, skillId, enabledTools, {
        name: getOptionalString(args.name) || existing?.name || '',
        description: getOptionalString(args.description) || existing?.description || '',
        content: getRequiredString(args.content, 'content'),
        enabled: true,
        requiredTools: getStringArray(args.required_tools),
      })

      return formatSavedSkill('skill_updated', updated)
    },
  }
}

function formatSavedSkill(label: string, skill: SkillProfile) {
  return [
    `${label}:`,
    `- id: ${skill.id}`,
    `- name: ${skill.name}`,
    `- description: ${skill.description}`,
    `- enabled: ${skill.enabled}`,
    `- required_tools: ${skill.requiredTools.length ? skill.requiredTools.join(', ') : 'none'}`,
  ].join('\n')
}

function formatSkillProfile(skill: SkillProfile) {
  return [
    `- id: ${skill.id}`,
    `  name: ${skill.name}`,
    `  description: ${skill.description}`,
    `  enabled: ${skill.enabled}`,
    `  required_tools: ${skill.requiredTools.length ? skill.requiredTools.join(', ') : 'none'}`,
  ].join('\n')
}

function getRequiredString(value: unknown, name: string) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`${name} is required`)
  }

  return value.trim()
}

function getOptionalString(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function getStringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string').map(item => item.trim()).filter(Boolean)
    : []
}
