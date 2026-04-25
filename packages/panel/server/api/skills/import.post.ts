import type { SkillImportInput, SkillProfile } from '@zakobot/shared'

export default defineEventHandler(async (event) => {
  const body = await readBody<SkillImportInput>(event)

  try {
    const skill = await corePost<SkillProfile>('/skills/import', body)
    return { ok: true, data: skill }
  }
  catch (error) {
    throw toPanelApiError(error, 'Failed to import skill')
  }
})
