/**
 * Copilot Agent Mode Hook
 *
 * When the model provider is github-copilot, this hook injects `is_agent: true`
 * into the providerOptions.extra_body to signal to the Copilot API that the
 * request comes from an agent context rather than a direct user interaction.
 *
 * This applies to ALL messages sent via github-copilot, not just agent-to-agent calls.
 */

import { log } from "../../shared"
import { isGithubCopilotProvider } from "../../shared/copilot-agent-options"

interface CopilotAgentModeInput {
  sessionID: string
  agent?: string
  model?: { providerID: string; modelID: string }
}

interface CopilotAgentModeOutput {
  message: Record<string, unknown>
}

export function createCopilotAgentModeHook() {
  return {
    "chat.message": async (
      input: CopilotAgentModeInput,
      output: CopilotAgentModeOutput
    ): Promise<void> => {
      const model = input.model
      if (!model || !isGithubCopilotProvider(model.providerID)) {
        return
      }

      // Get or create providerOptions
      const message = output.message
      const existingProviderOptions = (message.providerOptions ?? {}) as Record<string, unknown>

      // Get or create github-copilot specific options
      const copilotOptions = (existingProviderOptions["github-copilot"] ?? {}) as Record<string, unknown>

      // Get or create extra_body
      const extraBody = (copilotOptions.extra_body ?? {}) as Record<string, unknown>

      // Set is_agent flag
      extraBody.is_agent = true

      // Reassemble the structure
      copilotOptions.extra_body = extraBody
      existingProviderOptions["github-copilot"] = copilotOptions
      message.providerOptions = existingProviderOptions

      log("[copilot-agent-mode] Injected is_agent=true for github-copilot request", {
        sessionID: input.sessionID,
        model: model.modelID,
      })
    },
  }
}
