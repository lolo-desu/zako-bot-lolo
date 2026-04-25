import type { ConversationTopic } from '@zakobot/shared'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const botInstanceId = String(query.botInstanceId ?? '').trim()

  if (!botInstanceId) {
    throw createError({
      statusCode: 400,
      message: 'Bot instance ID is required',
    })
  }

  try {
    const topics = await coreGet<ConversationTopic[]>(`/conversations?botInstanceId=${encodeURIComponent(botInstanceId)}`)
    return { ok: true, data: topics }
  }
  catch (error) {
    throw toPanelApiError(error, 'Failed to load conversation topics')
  }
})
