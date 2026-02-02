import type { CopilotProxyContext, NormalizedResponse, SessionMessage } from "./types"
import { proxyLog } from "./utils"

const POLL_INTERVAL_MS = 300
const MAX_POLL_TIME_MS = 5 * 60 * 1000 // 5 minutes
const MIN_STABILITY_TIME_MS = 1000
const STABILITY_POLLS_REQUIRED = 3

/**
 * Poll child session until response is complete
 */
export async function pollChildSessionResponse(
  ctx: CopilotProxyContext,
  childSessionID: string,
  abortSignal?: AbortSignal
): Promise<NormalizedResponse> {
  const pollStart = Date.now()
  let lastMsgCount = 0
  let stablePolls = 0
  let pollCount = 0

  proxyLog("Starting poll loop", { childSessionID })

  while (Date.now() - pollStart < MAX_POLL_TIME_MS) {
    if (abortSignal?.aborted) {
      proxyLog("Poll aborted", { childSessionID })
      return { textContent: "", parts: [], hasContent: false }
    }

    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS))
    pollCount++

    // Check session status
    const statusResult = await ctx.client.session.status()
    const allStatuses = (statusResult.data ?? {}) as Record<string, { type: string }>
    const sessionStatus = allStatuses[childSessionID]

    if (pollCount % 10 === 0) {
      proxyLog("Poll status", {
        childSessionID,
        pollCount,
        elapsed: Math.floor((Date.now() - pollStart) / 1000) + "s",
        sessionStatus: sessionStatus?.type ?? "not_in_status",
        stablePolls,
        lastMsgCount,
      })
    }

    // If session is still busy, reset stability counter
    if (sessionStatus && sessionStatus.type !== "idle") {
      stablePolls = 0
      lastMsgCount = 0
      continue
    }

    // Wait minimum time before checking stability
    const elapsed = Date.now() - pollStart
    if (elapsed < MIN_STABILITY_TIME_MS) {
      continue
    }

    // Check message count for stability
    const messagesCheck = await ctx.client.session.messages({ path: { id: childSessionID } })
    const msgs = ((messagesCheck as { data?: unknown }).data ?? messagesCheck) as unknown[]
    const currentMsgCount = msgs.length

    if (currentMsgCount === lastMsgCount) {
      stablePolls++
      if (stablePolls >= STABILITY_POLLS_REQUIRED) {
        proxyLog("Poll complete - messages stable", { childSessionID, pollCount, currentMsgCount })
        break
      }
    } else {
      stablePolls = 0
      lastMsgCount = currentMsgCount
    }
  }

  if (Date.now() - pollStart >= MAX_POLL_TIME_MS) {
    proxyLog("Poll timeout reached", { childSessionID, pollCount, lastMsgCount, stablePolls })
  }

  // Fetch final messages
  const messagesResult = await ctx.client.session.messages({
    path: { id: childSessionID },
  })

  if (messagesResult.error) {
    proxyLog("Error fetching messages", { error: messagesResult.error })
    return { textContent: "", parts: [], hasContent: false }
  }

  const messages = ((messagesResult as { data?: unknown }).data ?? messagesResult) as SessionMessage[]

  return normalizeResponse(messages)
}

/**
 * Normalize the response from child session
 * Strips subagent-specific formatting and returns clean content
 */
export function normalizeResponse(messages: SessionMessage[]): NormalizedResponse {
  // Get the last assistant message
  const assistantMessages = messages
    .filter((m) => m.info?.role === "assistant")
    .sort((a, b) => (b.info?.time?.created ?? 0) - (a.info?.time?.created ?? 0))

  const lastMessage = assistantMessages[0]

  if (!lastMessage || !lastMessage.parts) {
    return { textContent: "", parts: [], hasContent: false }
  }

  // Extract text and reasoning parts
  const textParts = lastMessage.parts.filter(
    (p) => p.type === "text" || p.type === "reasoning"
  )

  // Normalize each part - strip subagent metadata
  const normalizedParts = textParts.map((p) => ({
    ...p,
    text: p.text ? stripSubagentMetadata(p.text) : undefined,
  }))

  const textContent = normalizedParts
    .map((p) => p.text ?? "")
    .filter(Boolean)
    .join("\n")

  return {
    textContent,
    parts: normalizedParts,
    hasContent: textContent.length > 0,
  }
}

/**
 * Strip subagent-specific metadata and formatting from text
 */
function stripSubagentMetadata(text: string): string {
  let result = text

  // Remove <task_metadata>...</task_metadata> blocks
  result = result.replace(/<task_metadata>[\s\S]*?<\/task_metadata>/gi, "")

  // Remove "Task completed in X" headers
  result = result.replace(/^Task completed in \d+[hms\d\s]+\.\s*\n*/i, "")

  // Remove "Agent: xxx" lines
  result = result.replace(/^Agent:\s+.+(\s*\(category:\s*[^)]+\))?\s*\n*/im, "")

  // Remove session ID lines
  result = result.replace(/\n*Session ID:\s*[a-zA-Z0-9_-]+\s*/gi, "")

  // Remove standalone "---" separators at the start (after removing headers)
  result = result.replace(/^---\s*\n+/m, "")

  // Remove "[TASK COMPLETED]" or "[BACKGROUND TASK COMPLETED]" wrappers
  result = result.replace(/^\[(?:BACKGROUND\s+)?TASK\s+COMPLETED\]\s*/i, "")

  // Clean up excessive newlines
  result = result.replace(/\n{3,}/g, "\n\n")

  return result.trim()
}

/**
 * Inject normalized response into main session
 * This makes the response appear as if it came from a direct user message
 */
export async function injectNormalizedResponse(
  ctx: CopilotProxyContext,
  mainSessionID: string,
  response: NormalizedResponse
): Promise<void> {
  if (!response.hasContent) {
    proxyLog("No content to inject", { mainSessionID })
    return
  }

  // The response should already be in the main session's context
  // because we're intercepting at chat.message level and letting
  // the child session response flow back through the parent relationship

  proxyLog("Response normalized", {
    mainSessionID,
    contentLength: response.textContent.length,
  })
}
