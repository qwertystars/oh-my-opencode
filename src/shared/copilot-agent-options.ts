/**
 * GitHub Copilot Agent Options
 *
 * When agents call other agents using the github-copilot provider,
 * we need to signal to the Copilot API that the request is coming
 * from another agent (not a direct user interaction).
 *
 * This module provides utilities to detect github-copilot provider
 * and construct the appropriate providerOptions with is_agent flag.
 */

export interface CopilotAgentProviderOptions {
  providerOptions: {
    "github-copilot": {
      extra_body: {
        is_agent: boolean
      }
    }
  }
}

/**
 * Checks if the given provider is github-copilot
 */
export function isGithubCopilotProvider(providerID: string | undefined): boolean {
  return providerID === "github-copilot"
}

/**
 * Gets provider options for github-copilot agent calls.
 * Returns undefined if the provider is not github-copilot.
 *
 * @param providerID - The provider ID from the model
 * @returns Provider options with is_agent flag, or undefined
 */
export function getCopilotAgentOptions(
  providerID: string | undefined
): CopilotAgentProviderOptions | undefined {
  if (!isGithubCopilotProvider(providerID)) {
    return undefined
  }

  return {
    providerOptions: {
      "github-copilot": {
        extra_body: {
          is_agent: true,
        },
      },
    },
  }
}

/**
 * Builds the copilot-specific portion of a prompt body for agent-to-agent calls.
 * This should be spread into the prompt body when calling session.prompt.
 *
 * @param model - The model object with providerID and modelID
 * @returns Object to spread into prompt body, empty if not github-copilot
 *
 * @example
 * ```typescript
 * await client.session.prompt({
 *   path: { id: sessionID },
 *   body: {
 *     agent: "explore",
 *     parts: [{ type: "text", text: "search for files" }],
 *     ...buildCopilotAgentBody(model),
 *   },
 * })
 * ```
 */
export function buildCopilotAgentBody(
  model: { providerID: string; modelID: string } | undefined
): CopilotAgentProviderOptions | Record<string, never> {
  return getCopilotAgentOptions(model?.providerID) ?? {}
}
