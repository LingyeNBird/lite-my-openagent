import type { Hooks, Plugin } from "@opencode-ai/plugin"

import {
  ensureLiteAgentCommand,
  rewriteAgentPrompts,
  rewriteInjectedModeText,
  rewriteLiteAgentSlashCommand,
} from "./rewriters.js"

const litePlugin: Plugin = async (): Promise<Hooks> => {
  return {
    config: async (config: Record<string, unknown>) => {
      ensureLiteAgentCommand(config)
      rewriteAgentPrompts(config)
    },

    "chat.message": async (
      _input: {
        sessionID: string
      },
      output: {
        parts: Array<{ type: string; text?: string; [key: string]: unknown }>
      },
    ): Promise<void> => {
      for (const part of output.parts) {
        if (part.type !== "text" || typeof part.text !== "string") {
          continue
        }

        part.text = rewriteLiteAgentSlashCommand(part.text)
        part.text = rewriteInjectedModeText(part.text)
      }
    },
  }
}

const pluginModule = {
  id: "lite-my-openagent",
  server: litePlugin,
}

export default pluginModule
