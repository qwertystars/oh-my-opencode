import type { ChatMessageInput, ChatMessageOutput } from "./types"
import { log } from "../../shared"

/**
 * Check if the model is using github-copilot provider
 */
export function isGithubCopilotProvider(
  model?: { providerID?: string; modelID?: string }
): boolean {
  return model?.providerID === "github-copilot"
}

/**
 * Extract the user message text from output parts
 * Combines all text parts (including synthetic hook content) into one string
 */
export function extractUserMessage(output: ChatMessageOutput): string {
  const textParts = output.parts.filter(
    (p) => p.type === "text" && p.text !== undefined
  )

  // Separate synthetic (hook-injected) and user parts
  const syntheticParts = textParts.filter((p) => p.synthetic === true)
  const userParts = textParts.filter((p) => p.synthetic !== true)

  // Combine: synthetic content first, then user message
  const syntheticText = syntheticParts.map((p) => p.text ?? "").join("\n\n")
  const userText = userParts.map((p) => p.text ?? "").join("\n\n")

  if (syntheticText && userText) {
    return `${syntheticText}\n\n---\n\n${userText}`
  }

  return userText || syntheticText || ""
}

/**
 * Extract system content from synthetic/hook parts
 * This can be used as the system prompt for the child session
 */
export function extractSystemContent(output: ChatMessageOutput): string {
  const syntheticParts = output.parts.filter(
    (p) => p.type === "text" && p.synthetic === true && p.text
  )

  return syntheticParts.map((p) => p.text ?? "").join("\n\n")
}

/**
 * Extract only the raw user message (without synthetic parts)
 */
export function extractRawUserMessage(output: ChatMessageOutput): string {
  const userParts = output.parts.filter(
    (p) => p.type === "text" && p.synthetic !== true && p.text
  )

  return userParts.map((p) => p.text ?? "").join("\n\n")
}

/**
 * Get default tool restrictions for child session
 */
export function getDefaultToolRestrictions(): Record<string, boolean> {
  return {
    task: false,
    delegate_task: false,
    call_omo_agent: true,
    question: false,
  }
}

/**
 * Check if session is a child/subagent session
 */
export async function isChildSession(
  client: { session: { get: (args: { path: { id: string } }) => Promise<{ data?: { parentID?: string } }> } },
  sessionID: string
): Promise<boolean> {
  try {
    const session = await client.session.get({ path: { id: sessionID } })
    return !!session.data?.parentID
  } catch {
    return false
  }
}

/**
 * Log helper for copilot proxy
 */
export function proxyLog(message: string, data?: Record<string, unknown>): void {
  log(`[copilot-subagent-proxy] ${message}`, data)
}
