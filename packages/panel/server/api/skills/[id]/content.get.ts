import type { SkillContent } from '@zakobot/shared'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ statusCode: 400, message: 'Skill id is required' })
  }

  try {
    const content = await coreGet<SkillContent>(`/skills/${id}/content`)
    return { ok: true, data: content }
  }
  catch (error) {
    throw toPanelApiError(error, 'Skill content not found')
  }
})
