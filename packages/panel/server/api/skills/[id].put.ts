import type { SkillEditorInput, SkillProfile } from '@zakobot/shared'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ statusCode: 400, message: 'Skill id is required' })
  }

  const body = await readBody<SkillEditorInput>(event)

  try {
    const skill = await corePut<SkillProfile>(`/skills/${id}`, body)
    return { ok: true, data: skill }
  }
  catch (error) {
    throw toPanelApiError(error, 'Failed to update skill')
  }
})
