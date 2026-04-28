export default defineEventHandler(async (event) => {
  await readBody(event)

  throw createError({
    statusCode: 410,
    message: 'This route is gone. Use /api/llm-providers/:id/fetch-models instead.',
  })
})
