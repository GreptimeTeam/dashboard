/**
 * URL query values may arrive either already decoded (typed by hand) or
 * encoded once by our own link builders (encodeURIComponent + router encode).
 * Decode when possible; otherwise treat the raw value as the payload.
 */
export function decodeMaybeEncoded(value: string): string {
  if (!value) return value
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

export default decodeMaybeEncoded
