import { createWebBrowseTool } from './builtins/web-browse.js'
import { createWebSearchTool } from './builtins/web-search.js'
import { createShellExecTool } from './builtins/shell-exec.js'
import { createFileReadTool, createFileWriteTool, createFileEditTool, createFileListTool } from './builtins/file-tools.js'
import { createMarkdownTableImageTool } from './builtins/markdown-table-image.js'
import { createSkillLoadTool } from './builtins/skill-load.js'
import { createSkillCreateTool, createSkillListMineTool, createSkillUpdateTool } from './builtins/skill-manage.js'
import { ToolRegistry } from './registry.js'
import type { BrowseSettings } from '@zakobot/shared'
import type { SearchSettings } from '@zakobot/shared'

export { ToolRegistry } from './registry.js'
export { createSkillLoadTool } from './builtins/skill-load.js'
export { createSkillCreateTool, createSkillListMineTool, createSkillUpdateTool } from './builtins/skill-manage.js'

export function createDefaultToolRegistry(
  getSearchSettings: () => SearchSettings,
  getBrowseSettings: () => BrowseSettings,
) {
  const registry = new ToolRegistry()

  registry.register(createWebSearchTool(getSearchSettings), { source: 'builtin' })
  registry.register(createWebBrowseTool(getBrowseSettings), { source: 'builtin' })
  registry.register(createShellExecTool(), { source: 'builtin' })
  registry.register(createFileReadTool(), { source: 'builtin' })
  registry.register(createFileWriteTool(), { source: 'builtin' })
  registry.register(createFileEditTool(), { source: 'builtin' })
  registry.register(createFileListTool(), { source: 'builtin' })
  registry.register(createMarkdownTableImageTool(), { source: 'builtin' })

  return registry
}
