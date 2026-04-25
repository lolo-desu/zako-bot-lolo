import type { SkillEditorInput, SkillProfile } from '@zakobot/shared'

export default defineEventHandler(async (event) => {
  const body = await readBody<SkillEditorInput>(event)

  try {
    const skill = await corePost<SkillProfile>('/skills', body)
    return { ok: true, data: skill }
  }
  catch (error) {
    throw toPanelApiError(error, 'Failed to create skill')
  }
})
