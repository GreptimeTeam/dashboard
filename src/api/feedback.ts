/** Public marketing/contact API (same host as greptime.com contact form). */
const FEEDBACK_API_URL = 'https://api.greptime.cloud'

export interface FeedbackPayload {
  name: string
  email: string
  phone?: string
  company?: string
  position?: string
  content: string
}

export interface FeedbackResult {
  error?: string
}

export async function submitFeedback(payload: FeedbackPayload): Promise<FeedbackResult> {
  const body = {
    ...payload,
    content: payload.phone ? `${payload.content}\n\n tel: ${payload.phone}` : payload.content,
  }

  const response = await fetch(`${FEEDBACK_API_URL}/feedback`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  return response.json() as Promise<FeedbackResult>
}
