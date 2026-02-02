import type { PluginInput } from "@opencode-ai/plugin"
import type {
  ChatMessageInput,
  ChatMessageOutput,
  CopilotProxyContext,
  CopilotProxyState,
} from "./types"
import {
  isGithubCopilotProvider,
  extractSystemContent,
  extractRawUserMessage,
  getDefaultToolRestrictions,
  isChildSession,
  proxyLog,
} from "./utils"
import { pollChildSessionResponse, injectNormalizedResponse } from "./response-normalizer"
import { subagentSessions } from "../../features/claude-code-session-state"

export * from "./types"
export * from "./utils"
export * from "./response-normalizer"

// State: main session ID -> child session state
const mainToChildSession = new Map<string, CopilotProxyState>()

// Track sessions currently being proxied to prevent re-entry
const proxyingInProgress = new Set<string>()

/**
 * Clean up state for a session
 */
function cleanupSession(sessionID: string): void {
  const state = mainToChildSession.get(sessionID)
  if (state) {
    subagentSessions.delete(state.childSessionID)
    mainToChildSession.delete(sessionID)
  }
  proxyingInProgress.delete(sessionID)
}

/**
 * Create the Copilot Subagent Proxy Hook
 *
 * This hook intercepts user messages to github-copilot provider and routes them
 * through a child session using delegate_task-style format. The response is then
 * normalized and injected back to the main session.
 */
export function createCopilotSubagentProxyHook(ctx: PluginInput) {
  const proxyCtx: CopilotProxyContext = {
    client: ctx.client,
    directory: ctx.directory,
  }

  return {
    "chat.message": async (
      input: ChatMessageInput,
      output: ChatMessageOutput
    ): Promise<boolean> => {
      // Skip if not github-copilot provider
      if (!isGithubCopilotProvider(input.model)) {
        return false
      }

      // Skip if this is already a child session (don't proxy child session messages)
      const isChild = await isChildSession(ctx.client, input.sessionID)
      if (isChild) {
        proxyLog("Skipping - already a child session", { sessionID: input.sessionID })
        return false
      }

      // Skip if already proxying this session (prevent re-entry)
      if (proxyingInProgress.has(input.sessionID)) {
        proxyLog("Skipping - proxy already in progress", { sessionID: input.sessionID })
        return false
      }

      proxyLog("Intercepting message for github-copilot", {
        sessionID: input.sessionID,
        agent: input.agent,
        model: input.model,
      })

      // Mark as proxying
      proxyingInProgress.add(input.sessionID)

      try {
        // Get or create child session
        let childState = mainToChildSession.get(input.sessionID)

        if (!childState) {
          // Create new child session
          const createResult = await ctx.client.session.create({
            body: {
              parentID: input.sessionID,
              title: `copilot-proxy-${Date.now()}`,
              permission: [
                { permission: "question", action: "deny" as const, pattern: "*" },
              ],
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            } as any,
            query: {
              directory: ctx.directory,
            },
          })

          if (createResult.error) {
            proxyLog("Failed to create child session", { error: createResult.error })
            proxyingInProgress.delete(input.sessionID)
            return false
          }

          const childSessionID = createResult.data.id
          subagentSessions.add(childSessionID)

          childState = {
            childSessionID,
            createdAt: Date.now(),
          }
          mainToChildSession.set(input.sessionID, childState)

          proxyLog("Created child session", {
            mainSessionID: input.sessionID,
            childSessionID,
          })
        }

        // Extract content from the user message
        const systemContent = extractSystemContent(output)
        const userMessage = extractRawUserMessage(output)

        if (!userMessage) {
          proxyLog("No user message to send", { sessionID: input.sessionID })
          proxyingInProgress.delete(input.sessionID)
          return false
        }

        // Construct the prompt in delegate_task format
        const promptBody = {
          agent: input.agent ?? "general",
          system: systemContent || undefined,
          tools: getDefaultToolRestrictions(),
          parts: [{ type: "text" as const, text: userMessage }],
          ...(input.model ? {
            model: {
              providerID: input.model.providerID,
              modelID: input.model.modelID
            }
          } : {}),
        }

        proxyLog("Sending to child session with delegate_task format", {
          childSessionID: childState.childSessionID,
          agent: promptBody.agent,
          hasSystem: !!promptBody.system,
          systemLength: promptBody.system?.length ?? 0,
          messageLength: userMessage.length,
        })

        // Send to child session
        await ctx.client.session.prompt({
          path: { id: childState.childSessionID },
          body: promptBody,
        })

        // Poll for response
        const response = await pollChildSessionResponse(
          proxyCtx,
          childState.childSessionID
        )

        // Inject normalized response back to main session
        await injectNormalizedResponse(proxyCtx, input.sessionID, response)

        proxyLog("Proxy complete", {
          mainSessionID: input.sessionID,
          childSessionID: childState.childSessionID,
          hasResponse: response.hasContent,
        })

        // Return true to indicate we handled this message
        // The original message flow should be blocked
        return true

      } catch (error) {
        proxyLog("Proxy error", {
          sessionID: input.sessionID,
          error: error instanceof Error ? error.message : String(error),
        })
        return false
      } finally {
        proxyingInProgress.delete(input.sessionID)
      }
    },

    /**
     * Handle session events for cleanup
     */
    event: async ({ event }: { event: { type: string; properties?: unknown } }) => {
      const props = event.properties as { info?: { id?: string } } | undefined

      if (event.type === "session.deleted") {
        const sessionID = props?.info?.id
        if (sessionID) {
          cleanupSession(sessionID)

          // Also clean up if this was a child session
          for (const [mainID, state] of mainToChildSession.entries()) {
            if (state.childSessionID === sessionID) {
              mainToChildSession.delete(mainID)
              break
            }
          }
        }
      }
    },
  }
}
