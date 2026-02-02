import type { PluginInput } from "@opencode-ai/plugin"

export interface CopilotProxyState {
  childSessionID: string
  createdAt: number
}

export interface SessionMessage {
  info?: {
    id?: string
    role?: string
    sessionID?: string
    time?: {
      created?: number
    }
  }
  parts?: Array<{
    type: string
    text?: string
    [key: string]: unknown
  }>
}

export interface ChatMessageInput {
  sessionID: string
  agent?: string
  model?: { providerID: string; modelID: string }
  messageID?: string
}

export interface ChatMessageOutput {
  message: Record<string, unknown>
  parts: Array<{
    type: string
    text?: string
    synthetic?: boolean
    [key: string]: unknown
  }>
  block?: boolean
}

export interface CopilotProxyContext {
  client: PluginInput["client"]
  directory: string
}

export interface NormalizedResponse {
  textContent: string
  parts: Array<{
    type: string
    text?: string
    [key: string]: unknown
  }>
  hasContent: boolean
}

export interface ProxyConfig {
  enabled: boolean
}
