import type { RoleEditorInput, RoleProfile } from '@zakobot/shared'

export default defineEventHandler(async (event) => {
  const body = await readBody<RoleEditorInput>(event)

  try {
    const role = await corePost<RoleProfile>('/roles', body)
    return { ok: true, data: role }
  }
  catch (error) {
    throw toPanelApiError(error, 'Failed to create role')
  }
})
