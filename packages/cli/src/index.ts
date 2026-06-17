#!/usr/bin/env node
import { program } from 'commander'
import { spawn } from 'child_process'
import { createRequire } from 'module'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { homedir } from 'os'
import { mkdirSync, existsSync, writeFileSync, readFileSync } from 'fs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)
const pkg = require('../package.json') as { version: string }

program
  .name('zakobot')
  .description('ZakoBot — modular LLM bot framework')
  .version(pkg.version)

program
  .command('init')
  .description('Initialize ZakoBot config directory (~/.zakobot)')
  .action(cmdInit)

program
  .command('core')
  .description('Start the bot core process')
  .action(() => { runPackage('core') })

program
  .command('panel')
  .description('Start the web panel (http://localhost:6324)')
  .action(() => { runPackage('panel') })

program
  .command('netdisk')
  .description('Start the netdisk file sharing service')
  .action(() => { runPackage('netdisk') })

program
  .command('start')
  .description('Start core and panel; also start netdisk when NETDISK_ENABLED=true')
  .action(cmdStart)

program.parse()

// ─── commands ────────────────────────────────────────────────────────────────

function cmdInit() {
  const home = zakobotHome()
  mkdirSync(home, { recursive: true })

  const envFile = resolve(home, '.env')
  if (!existsSync(envFile)) {
    writeFileSync(envFile, [
      '# ZakoBot configuration',
      '# CORE_API_PORT=6325',
      '# PANEL_PORT=6324',
    ].join('\n') + '\n')
  }

  console.log(`Initialized ZakoBot at ${home}`)
  console.log('')
  console.log('Next steps:')
  console.log('  1. Run: zakobot start')
  console.log('  2. Open: http://localhost:6324')
  console.log('  3. Add a Bot and configure your LLM in the panel')
}

function cmdStart(): void {
  for (const [key, value] of Object.entries(loadRuntimeEnv())) {
    process.env[key] ??= value
  }

  const coreProc = runPackage('core')
  const panelProc = runPackage('panel')
  const netdiskProc = process.env.NETDISK_ENABLED === 'true' ? runPackage('netdisk') : null

  const shutdown = () => {
    coreProc.kill('SIGTERM')
    panelProc.kill('SIGTERM')
    netdiskProc?.kill('SIGTERM')
  }
  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function zakobotHome() {
  return process.env.ZAKOBOT_HOME ?? resolve(homedir(), '.zakobot')
}

type PackageName = 'core' | 'panel' | 'netdisk'

function loadRuntimeEnv(): Record<string, string> {
  const envFile = resolve(zakobotHome(), 'netdisk.env')
  return existsSync(envFile) ? readEnvFile(envFile) : {}
}

function readEnvFile(filePath: string): Record<string, string> {
  const result: Record<string, string> = {}
  const content = readFileSync(filePath, 'utf8')

  for (const line of content.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) {
      continue
    }

    const index = trimmed.indexOf('=')
    if (index === -1) {
      continue
    }

    const key = trimmed.slice(0, index).trim()
    const value = trimmed.slice(index + 1).trim()
    if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
      result[key] = value
    }
  }

  return result
}

function resolveEntry(pkgName: PackageName): string {
  const pkgJsonPath = require.resolve(`@zakobot/${pkgName}/package.json`) as string
  const pkgJson = require(pkgJsonPath) as { main: string }
  return resolve(dirname(pkgJsonPath), pkgJson.main)
}

function runPackage(pkgName: PackageName) {
  const entry = resolveEntry(pkgName)
  const home = zakobotHome()
  mkdirSync(home, { recursive: true })
  const loadedEnv = loadRuntimeEnv()
  const mergedEnv = {
    ...loadedEnv,
    ...process.env,
  }
  const coreApiPort = mergedEnv.CORE_API_PORT ?? '6325'
  const panelPort = mergedEnv.PANEL_PORT ?? mergedEnv.NITRO_PORT ?? mergedEnv.PORT ?? '6324'
  const packageEnv = pkgName === 'panel'
    ? {
        CORE_API_URL: mergedEnv.CORE_API_URL ?? `http://127.0.0.1:${coreApiPort}`,
        NITRO_PORT: panelPort,
        PORT: panelPort,
      }
    : {}

  const child = spawn(process.execPath, [entry], {
    stdio: 'inherit',
    env: {
      ...mergedEnv,
      ...packageEnv,
      ZAKOBOT_HOME: home,
    },
  })

  child.on('error', (err) => {
    console.error(`[${pkgName}] Failed to start:`, err.message)
    process.exit(1)
  })

  return child
}
