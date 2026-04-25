import type { RoleProfile } from '@zakobot/shared'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')

  if (!id) {
    throw createError({ statusCode: 400, message: 'Role id is required' })
  }

  try {
    const role = await coreDelete<RoleProfile>(`/roles/${id}`)
    return { ok: true, data: role }
  }
  catch (error) {
    throw toPanelApiError(error, 'Failed to delete role')
  }
})
