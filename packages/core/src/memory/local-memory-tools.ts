import type { LLMTool } from '@zakobot/shared'
import type { LocalMemoryService } from './local-memory-service.js'

type MemoryToolScope = {
  botInstanceId: string
  platform: string
  userId: string
  topicId: string
}

export function createLocalMemoryTools(
  localMemoryService: LocalMemoryService,
  scope: MemoryToolScope,
): LLMTool[] {
  return [
    {
      name: 'memory_list',
      description: 'List long-term memories stored for the current user and bot.',
      instructions: 'Use this before updating or deleting memories, and when the user asks what you remember. Do not expose unrelated implementation details.',
      parameters: {
        type: 'object',
        properties: {},
        additionalProperties: false,
      },
      async execute() {
        const memories = localMemoryService.listMemories(scope)
        if (memories.length === 0) {
          return 'No long-term memories are stored for this user.'
        }

        return JSON.stringify(memories.map(memory => ({
          id: memory.id,
          memory: memory.memory,
          kind: memory.kind,
          updatedAt: memory.updatedAt.toISOString(),
          lastUsedAt: memory.lastUsedAt.toISOString(),
        })), null, 2)
      },
    },
    {
      name: 'memory_save',
      description: 'Save or update one stable long-term memory for the current user.',
      instructions: 'Use this when the user explicitly asks you to remember something, or when a stable preference/profile/project fact will clearly help future conversations. Never save secrets, credentials, tokens, one-time tasks, or temporary facts.',
      parameters: {
        type: 'object',
        properties: {
          memory: {
            type: 'string',
            description: 'The concise memory to store, 4-200 characters.',
          },
          kind: {
            type: 'string',
            enum: ['preference', 'constraint', 'profile', 'project', 'fact'],
            description: 'The memory category.',
          },
        },
        required: ['memory'],
        additionalProperties: false,
      },
      async execute(args) {
        const memory = typeof args.memory === 'string' ? args.memory : ''
        const kind = typeof args.kind === 'string' ? args.kind : 'fact'

        localMemoryService.saveMemory({ ...scope, memory, kind })
        return `Saved memory: ${memory.trim()}`
      },
    },
    {
      name: 'memory_delete',
      description: 'Delete one long-term memory for the current user by id.',
      instructions: 'Use this when the user asks you to forget or remove a stored memory. Call memory_list first if you do not know the memory id.',
      parameters: {
        type: 'object',
        properties: {
          id: {
            type: 'string',
            description: 'The memory id returned by memory_list.',
          },
        },
        required: ['id'],
        additionalProperties: false,
      },
      async execute(args) {
        const id = typeof args.id === 'string' ? args.id : ''
        const deleted = localMemoryService.deleteMemory({ ...scope, id })
        return deleted ? `Deleted memory: ${id.trim()}` : `Memory not found: ${id.trim()}`
      },
    },
  ]
}
