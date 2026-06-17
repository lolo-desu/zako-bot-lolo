import { loadConfig } from './config.js'
import { NetdiskAuth } from './auth.js'
import { NetdiskService } from './netdisk-service.js'
import { NetdiskHttpServer } from './http-server.js'

const config = loadConfig()
const service = new NetdiskService(config)
const auth = new NetdiskAuth(config)
const server = new NetdiskHttpServer(service, auth)

let shuttingDown = false

async function shutdown(signal: string) {
  if (shuttingDown) {
    return
  }

  shuttingDown = true
  console.log(`[Netdisk] Received ${signal}, shutting down...`)
  await server.stop()
  process.exit(0)
}

process.once('SIGINT', () => { void shutdown('SIGINT') })
process.once('SIGTERM', () => { void shutdown('SIGTERM') })

server.start().then(() => {
  console.log(`[Netdisk] Listening on ${config.host}:${config.port}`)
  console.log(`[Netdisk] Public URL: ${config.publicUrl}`)
  if (!config.internalToken) {
    console.warn('[Netdisk] NETDISK_INTERNAL_TOKEN is not set. Bot uploads via Bearer token are disabled.')
  }
  if (config.adminPassword === '123456') {
    console.warn('[Netdisk] NETDISK_ADMIN_PASSWORD is using the default password. Change it before exposing the service.')
  }
}).catch((error) => {
  console.error('[Netdisk] Fatal error:', error)
  process.exit(1)
})
