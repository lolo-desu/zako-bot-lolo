import type { RoleEditorInput, RoleProfile } from '@zakobot/shared'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')

  if (!id) {
    throw createError({ statusCode: 400, message: 'Role id is required' })
  }

  const body = await readBody<RoleEditorInput>(event)

  try {
    const role = await corePut<RoleProfile>(`/roles/${id}`, body)
    return { ok: true, data: role }
  }
  catch (error) {
    throw toPanelApiError(error, 'Failed to update role')
  }
})
