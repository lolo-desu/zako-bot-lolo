import type http from 'http'
import type { ApiResponse, SendConversationMessageResult } from '@zakobot/shared'
import type { BotManager } from '../../bot/bot-manager.js'
import { getApiErrorMessage, getApiErrorStatus, readJsonBody } from '../http.js'
import { toConversationMessage, toConversationTopic } from '../serializers.js'
import { parseCreateConversationTopicInput, parseSendConversationMessageInput } from '../validators.js'

type RouteResult = {
  status?: number
  body: ApiResponse<unknown>
}

export async function getConversationsRoute(
  req: http.IncomingMessage,
  pathname: string,
  searchParams: URLSearchParams,
  botManager: BotManager,
): Promise<RouteResult | undefined> {
  if (pathname === '/conversations' && req.method === 'GET') {
    const botInstanceId = requireBotInstanceId(searchParams)
    if (botInstanceId instanceof Error) {
      return { status: 400, body: { ok: false, error: botInstanceId.message } }
    }

    try {
      const topics = botManager
        .listConversationTopics(botInstanceId)
        .map(topic => toConversationTopic(topic))

      return { body: { ok: true, data: topics } }
    }
    catch (error) {
      return notFoundAwareError(error, 'Failed to load conversation topics')
    }
  }

  if (pathname === '/conversations' && req.method === 'POST') {
    try {
      const payload = parseCreateConversationTopicInput(await readJsonBody(req))
      const topic = botManager.startPanelConversation(payload.botInstanceId)
      return { status: 201, body: { ok: true, data: toConversationTopic(topic) } }
    }
    catch (error) {
      return notFoundAwareError(error, 'Failed to create conversation topic')
    }
  }

  if (pathname === '/conversations/messages' && req.method === 'POST') {
    try {
      const payload = parseSendConversationMessageInput(await readJsonBody(req))
      const result = await botManager.sendPanelMessage(payload.botInstanceId, payload.content, payload.topicId)
      const data: SendConversationMessageResult = {
        topic: toConversationTopic(result.topic),
        userMessage: toConversationMessage(result.userMessage),
        assistantMessage: toConversationMessage(result.assistantMessage),
      }

      return { body: { ok: true, data } }
    }
    catch (error) {
      return notFoundAwareError(error, 'Failed to send conversation message')
    }
  }

  const conversationMatch = pathname.match(/^\/conversations\/([^/]+)$/)
  if (conversationMatch && req.method === 'DELETE') {
    const botInstanceId = requireBotInstanceId(searchParams)
    if (botInstanceId instanceof Error) {
      return { status: 400, body: { ok: false, error: botInstanceId.message } }
    }

    try {
      const topic = await botManager.deleteConversationTopic(botInstanceId, conversationMatch[1])
      return { body: { ok: true, data: toConversationTopic(topic) } }
    }
    catch (error) {
      return notFoundAwareError(error, 'Failed to delete conversation topic')
    }
  }

  const conversationMessagesMatch = pathname.match(/^\/conversations\/([^/]+)\/messages$/)
  if (conversationMessagesMatch && req.method === 'GET') {
    const botInstanceId = requireBotInstanceId(searchParams)
    if (botInstanceId instanceof Error) {
      return { status: 400, body: { ok: false, error: botInstanceId.message } }
    }

    try {
      const messages = botManager
        .listConversationMessages(botInstanceId, conversationMessagesMatch[1])
        .map(message => toConversationMessage(message))

      return { body: { ok: true, data: messages } }
    }
    catch (error) {
      return notFoundAwareError(error, 'Failed to load conversation messages')
    }
  }

  return undefined
}

function requireBotInstanceId(searchParams: URLSearchParams): string | Error {
  const botInstanceId = searchParams.get('botInstanceId')?.trim()
  return botInstanceId ? botInstanceId : new Error('Bot instance ID is required')
}

function notFoundAwareError(error: unknown, fallback: string): RouteResult {
  const message = getApiErrorMessage(error, fallback)
  const status = message.includes('not found') ? 404 : 400
  return {
    status: getApiErrorStatus(error, status),
    body: { ok: false, error: message },
  }
}
