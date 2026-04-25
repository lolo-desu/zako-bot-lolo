import type { ConversationMessage } from '@zakobot/shared'

export default defineEventHandler(async (event) => {
  const topicId = getRouterParam(event, 'id')
  const query = getQuery(event)
  const botInstanceId = String(query.botInstanceId ?? '').trim()

  if (!topicId || !botInstanceId) {
    throw createError({
      statusCode: 400,
      message: 'Bot instance ID and topic ID are required',
    })
  }

  try {
    const messages = await coreGet<ConversationMessage[]>(
      `/conversations/${encodeURIComponent(topicId)}/messages?botInstanceId=${encodeURIComponent(botInstanceId)}`,
    )
    return { ok: true, data: messages }
  }
  catch (error) {
    throw toPanelApiError(error, 'Failed to load conversation messages')
  }
})
