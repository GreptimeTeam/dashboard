// Shared singleton helper for getting/creating the global WebMCP instance

// WebMCP is provided globally via a <script> tag in index.html
// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare const WebMCP: any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare const window: any

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let mcpInstance: any | null = null
let initializing: Promise<any> | null = null

// Ensure there is a single shared WebMCP instance (window.__webmcp).
// Returns null if the script is not ready or initialization fails.
const ensureWebMcpInstance = async () => {
  if (mcpInstance) return mcpInstance
  if (initializing) return initializing

  initializing = (async () => {
    if (window?.__webmcp) {
      mcpInstance = window.__webmcp
      return mcpInstance
    }
    if (typeof WebMCP !== 'function') {
      return null
    }
    try {
      const instance = new WebMCP({ position: 'bottom-right' })
      window.__webmcp = instance
      mcpInstance = instance
      return instance
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error(error)
      return null
    }
  })()

  const instance = await initializing
  initializing = null
  return instance
}

export default ensureWebMcpInstance
