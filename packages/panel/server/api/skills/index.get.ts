import type { SkillProfile } from '@zakobot/shared'

export default defineEventHandler(async () => {
  try {
    const skills = await coreGet<SkillProfile[]>('/skills')
    return { ok: true, data: skills }
  }
  catch (error) {
    throw toPanelApiError(error, 'Core is unreachable')
  }
})
