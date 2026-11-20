/**
 * `/v1/sql` rejections are plain `{ error, startTime }` payloads built by the interceptor,
 * not `Error` instances — checking `error instanceof Error` always falls through to the
 * "unknown error" copy and hides the server's message.
 */
const apiErrorMessage = (error: unknown, fallback: string): string => {
  const fromPayload = (error as { error?: unknown } | null)?.error
  if (typeof fromPayload === 'string' && fromPayload) return fromPayload
  if (error instanceof Error && error.message) return error.message
  return fallback
}

export default apiErrorMessage
