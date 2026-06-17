import type { RoleEditorInput } from '../types/role.js'

const BUILTIN_TOOLS = new Set<string>(['web_search', 'web_browse', 'shell_exec', 'file_read', 'file_write', 'file_edit', 'file_list', 'render_markdown_table_image', 'netdisk_upload'])

export function createDefaultRoleEditorInput(): RoleEditorInput {
  return {
    avatar: '',
    name: '',
    systemPrompt: '',
    enabledTools: [],
    enabledSkills: [],
  }
}

export function normalizeEnabledToolNames(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return []
  }

  const result: string[] = []
  const seen = new Set<string>()

  for (const tool of value) {
    if (typeof tool !== 'string' || seen.has(tool)) {
      continue
    }

    seen.add(tool)

    if (BUILTIN_TOOLS.has(tool) || /^mcp__[a-zA-Z0-9_-]+__.+$/.test(tool)) {
      result.push(tool)
    }
  }

  return result
}

export function normalizeEnabledSkillIds(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return []
  }

  const result: string[] = []
  const seen = new Set<string>()

  for (const skillId of value) {
    if (typeof skillId !== 'string') {
      continue
    }

    const normalized = skillId.trim()
    if (!normalized || seen.has(normalized)) {
      continue
    }

    seen.add(normalized)
    result.push(normalized)
  }

  return result
}

export function normalizeRoleEditorInput(body: Partial<RoleEditorInput>): RoleEditorInput {
  return {
    ...createDefaultRoleEditorInput(),
    avatar: body.avatar?.trim() ?? '',
    name: body.name?.trim() ?? '',
    systemPrompt: body.systemPrompt?.trim() ?? '',
    enabledTools: normalizeEnabledToolNames(body.enabledTools),
    enabledSkills: normalizeEnabledSkillIds(body.enabledSkills),
  }
}

export function getRoleEditorInputError(input: RoleEditorInput): string | null {
  if (!input.name) {
    return 'Role name is required'
  }

  if (!input.systemPrompt) {
    return 'Role systemPrompt is required'
  }

  return null
}
