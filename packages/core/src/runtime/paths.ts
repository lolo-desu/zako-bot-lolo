import { mkdirSync } from 'fs'
import { homedir } from 'os'
import { resolve } from 'path'

export function getZakobotHome(): string {
  return resolveConfigPath(process.env.ZAKOBOT_HOME) ?? resolve(homedir(), '.zakobot')
}

export function getMcpWorkdir(zakobotHome: string): string {
  return resolveConfigPath(process.env.ZAKOBOT_MCP_WORKDIR) ?? resolve(zakobotHome, 'mcp')
}

export function getSkillsRoot(zakobotHome: string): string {
  return resolveConfigPath(process.env.ZAKOBOT_SKILLS_DIR) ?? resolve(zakobotHome, 'skills')
}

export function getGeneratedImagesDir(zakobotHome: string): string {
  return resolveConfigPath(process.env.ZAKOBOT_GENERATED_IMAGES_DIR) ?? resolve(zakobotHome, 'generated-images')
}

export function resolveZakobotPath(basePath: string, ...paths: string[]): string {
  return resolve(basePath, ...paths)
}

export function ensureDirectory(path: string): string {
  mkdirSync(path, { recursive: true })
  return path
}

function resolveConfigPath(value: string | undefined): string | undefined {
  const raw = value?.trim()
  if (!raw) {
    return undefined
  }

  if (raw === '~') {
    return homedir()
  }

  if (raw.startsWith('~/') || raw.startsWith('~\\')) {
    return resolve(homedir(), raw.slice(2))
  }

  return resolve(raw)
}
