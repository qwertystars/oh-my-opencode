import { describe, expect, it } from "bun:test"
import { createCopilotAgentModeHook } from "./index"

describe("copilot-agent-mode hook", () => {
  describe("chat.message", () => {
    it("injects is_agent=true for github-copilot provider", async () => {
      const hook = createCopilotAgentModeHook()

      const input = {
        sessionID: "test-session",
        agent: "sisyphus",
        model: { providerID: "github-copilot", modelID: "gpt-5.2" },
      }

      const output = {
        message: {} as Record<string, unknown>,
      }

      await hook["chat.message"](input, output)

      expect(output.message.providerOptions).toEqual({
        "github-copilot": {
          extra_body: {
            is_agent: true,
          },
        },
      })
    })

    it("does not modify message for non-copilot provider", async () => {
      const hook = createCopilotAgentModeHook()

      const input = {
        sessionID: "test-session",
        agent: "sisyphus",
        model: { providerID: "anthropic", modelID: "claude-opus-4-5" },
      }

      const output = {
        message: {} as Record<string, unknown>,
      }

      await hook["chat.message"](input, output)

      expect(output.message.providerOptions).toBeUndefined()
    })

    it("does not modify message when no model is provided", async () => {
      const hook = createCopilotAgentModeHook()

      const input = {
        sessionID: "test-session",
        agent: "sisyphus",
      }

      const output = {
        message: {} as Record<string, unknown>,
      }

      await hook["chat.message"](input, output)

      expect(output.message.providerOptions).toBeUndefined()
    })

    it("preserves existing providerOptions for github-copilot", async () => {
      const hook = createCopilotAgentModeHook()

      const input = {
        sessionID: "test-session",
        agent: "sisyphus",
        model: { providerID: "github-copilot", modelID: "gpt-5.2" },
      }

      const output = {
        message: {
          providerOptions: {
            "github-copilot": {
              extra_body: {
                some_other_option: "value",
              },
            },
          },
        } as Record<string, unknown>,
      }

      await hook["chat.message"](input, output)

      expect(output.message.providerOptions).toEqual({
        "github-copilot": {
          extra_body: {
            some_other_option: "value",
            is_agent: true,
          },
        },
      })
    })

    it("preserves other provider options", async () => {
      const hook = createCopilotAgentModeHook()

      const input = {
        sessionID: "test-session",
        agent: "sisyphus",
        model: { providerID: "github-copilot", modelID: "gpt-5.2" },
      }

      const output = {
        message: {
          providerOptions: {
            anthropic: {
              some_option: true,
            },
          },
        } as Record<string, unknown>,
      }

      await hook["chat.message"](input, output)

      expect(output.message.providerOptions).toEqual({
        anthropic: {
          some_option: true,
        },
        "github-copilot": {
          extra_body: {
            is_agent: true,
          },
        },
      })
    })
  })
})
