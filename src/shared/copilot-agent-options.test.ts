import { describe, expect, it } from "bun:test"
import {
  isGithubCopilotProvider,
  getCopilotAgentOptions,
  buildCopilotAgentBody,
} from "./copilot-agent-options"

describe("copilot-agent-options", () => {
  describe("isGithubCopilotProvider", () => {
    it("returns true for github-copilot provider", () => {
      expect(isGithubCopilotProvider("github-copilot")).toBe(true)
    })

    it("returns false for other providers", () => {
      expect(isGithubCopilotProvider("anthropic")).toBe(false)
      expect(isGithubCopilotProvider("openai")).toBe(false)
      expect(isGithubCopilotProvider("google")).toBe(false)
      expect(isGithubCopilotProvider("opencode")).toBe(false)
    })

    it("returns false for undefined", () => {
      expect(isGithubCopilotProvider(undefined)).toBe(false)
    })
  })

  describe("getCopilotAgentOptions", () => {
    it("returns providerOptions with is_agent true for github-copilot", () => {
      const result = getCopilotAgentOptions("github-copilot")
      expect(result).toEqual({
        providerOptions: {
          "github-copilot": {
            extra_body: {
              is_agent: true,
            },
          },
        },
      })
    })

    it("returns undefined for other providers", () => {
      expect(getCopilotAgentOptions("anthropic")).toBeUndefined()
      expect(getCopilotAgentOptions("openai")).toBeUndefined()
      expect(getCopilotAgentOptions(undefined)).toBeUndefined()
    })
  })

  describe("buildCopilotAgentBody", () => {
    it("returns providerOptions for github-copilot model", () => {
      const result = buildCopilotAgentBody({
        providerID: "github-copilot",
        modelID: "gpt-5.2",
      })
      expect(result).toEqual({
        providerOptions: {
          "github-copilot": {
            extra_body: {
              is_agent: true,
            },
          },
        },
      })
    })

    it("returns empty object for non-copilot model", () => {
      const result = buildCopilotAgentBody({
        providerID: "anthropic",
        modelID: "claude-opus-4-5",
      })
      expect(result).toEqual({})
    })

    it("returns empty object for undefined model", () => {
      const result = buildCopilotAgentBody(undefined)
      expect(result).toEqual({})
    })

    it("can be spread into prompt body", () => {
      const model = { providerID: "github-copilot", modelID: "gpt-5.2" }
      const body = {
        agent: "explore",
        parts: [{ type: "text", text: "test" }],
        ...buildCopilotAgentBody(model),
      }

      expect(body.agent).toBe("explore")
      expect(body.parts).toEqual([{ type: "text", text: "test" }])
      expect(body.providerOptions).toEqual({
        "github-copilot": {
          extra_body: {
            is_agent: true,
          },
        },
      })
    })

    it("does not add providerOptions for non-copilot model when spread", () => {
      const model = { providerID: "anthropic", modelID: "claude-opus-4-5" }
      const body = {
        agent: "explore",
        parts: [{ type: "text", text: "test" }],
        ...buildCopilotAgentBody(model),
      }

      expect(body.agent).toBe("explore")
      expect(body.parts).toEqual([{ type: "text", text: "test" }])
      expect(body).not.toHaveProperty("providerOptions")
    })
  })
})
