import type { SkillProfile } from '@zakobot/shared'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ statusCode: 400, message: 'Skill id is required' })
  }

  try {
    const skill = await coreGet<SkillProfile>(`/skills/${id}`)
    return { ok: true, data: skill }
  }
  catch (error) {
    throw toPanelApiError(error, 'Skill not found')
  }
})
