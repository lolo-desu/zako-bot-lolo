import type { RoleProfile } from '@zakobot/shared'

export default defineEventHandler(async () => {
  try {
    const roles = await coreGet<RoleProfile[]>('/roles')
    return { ok: true, data: roles }
  }
  catch (error) {
    throw toPanelApiError(error, 'Core is unreachable')
  }
})
