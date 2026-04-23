import type { Hooks, Plugin } from "@opencode-ai/plugin"

import { ensureLiteAgentCommandFile } from "./command-installer.js"
import {
  ensureLiteAgentCommand,
  injectLiteSystemPrompt,
  rewriteAgentPrompts,
  rewriteInjectedModeText,
  rewriteLiteAgentSlashCommand,
} from "./rewriters.js"

const litePlugin: Plugin = async (ctx: { directory?: string }): Promise<Hooks> => {
  ensureLiteAgentCommandFile(ctx.directory)

  return {
    config: async (config: Record<string, unknown>) => {
      ensureLiteAgentCommand(config)
      rewriteAgentPrompts(config)
    },

    "experimental.chat.system.transform": async (
      _input: { sessionID?: string; model: { id: string; providerID: string; [key: string]: unknown } },
      output: { system: string[] },
    ): Promise<void> => {
      injectLiteSystemPrompt(output)
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
