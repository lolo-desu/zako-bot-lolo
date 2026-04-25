import type { LLMConfig } from './llm.js'

export type BuiltinTool = 'web_search' | 'web_browse' | 'shell_exec' | 'file_read' | 'file_write' | 'file_edit' | 'file_list' | 'render_markdown_table_image'

/** enabledTools 可以是内置工具名或 MCP 工具名（格式：mcp__serverName__toolName） */
export type EnabledTool = BuiltinTool | string

export interface RoleEditorInput {
  avatar: string
  name: string
  systemPrompt: string
  enabledTools: EnabledTool[]
  enabledSkills: string[]
}

export interface RoleProfile extends RoleEditorInput {
  id: string
  createdAt: string
  updatedAt: string
}

export interface Role {
  id: string
  avatar: string
  name: string
  /** System prompt that defines the AI's personality and behavior */
  systemPrompt: string
  llmConfig: LLMConfig
  enabledTools: EnabledTool[]
  enabledSkills: string[]
  createdAt: string
  updatedAt: string
}
