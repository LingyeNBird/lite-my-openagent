import type { Hooks, Plugin } from "@opencode-ai/plugin"

import { LITE_AGENT_COMMAND_NAME, LITE_POLICY_MARKER } from "./lite-policy.js"
import {
  ensureLiteAgentCommand,
  injectLiteSystemPrompt,
  rewriteAgentPrompts,
  rewriteInjectedModeText,
  rewriteLiteAgentSlashCommand,
} from "./rewriters.js"
import { createRuntimeLogger, type RuntimeLogger } from "./runtime-log.js"
import { createUpdateCheckHook } from "./update-checker.js"

type LitePluginOptions = {
  auto_update?: boolean
  show_update_toast?: boolean
}

function summarizeText(text: string): Record<string, unknown> {
  return {
    length: text.length,
    startsWithSlashLiteAgent: /^\s*\/lite-agent(?:\s|$)/i.test(text),
    containsLiteAgent: text.includes("/lite-agent"),
    containsAnalyzeMode: text.includes("[analyze-mode]"),
    containsSearchMode: text.includes("[search-mode]"),
    containsLiteMarker: text.includes(LITE_POLICY_MARKER),
    preview: text.slice(0, 200),
  }
}

function summarizeParts(parts: Array<{ type: string; text?: string; [key: string]: unknown }>): Record<string, unknown> {
  const textParts = parts.flatMap((part) => {
    if (part.type !== "text" || typeof part.text !== "string") {
      return []
    }

    return [summarizeText(part.text)]
  })

  return {
    partCount: parts.length,
    partTypes: parts.map((part) => part.type),
    textParts,
  }
}

function summarizeCommands(config: Record<string, unknown>): Record<string, unknown> {
  const commandValue = config["command"]
  if (!commandValue || typeof commandValue !== "object" || Array.isArray(commandValue)) {
    return {
      commandShape: Array.isArray(commandValue) ? "array" : typeof commandValue,
      commandCount: 0,
      commandNames: [],
      hasLiteAgentCommand: false,
    }
  }

  const commandRecord = commandValue as Record<string, unknown>
  const commandNames = Object.keys(commandRecord).sort()
  const liteAgentCommand = commandRecord[LITE_AGENT_COMMAND_NAME]

  return {
    commandShape: "object",
    commandCount: commandNames.length,
    commandNames,
    hasLiteAgentCommand: LITE_AGENT_COMMAND_NAME in commandRecord,
    liteAgentCommandShape:
      liteAgentCommand && typeof liteAgentCommand === "object" && !Array.isArray(liteAgentCommand)
        ? Object.keys(liteAgentCommand as Record<string, unknown>).sort()
        : typeof liteAgentCommand,
  }
}

function summarizeAgents(config: Record<string, unknown>): Record<string, unknown> {
  const agentValue = config["agent"]
  if (!agentValue || typeof agentValue !== "object" || Array.isArray(agentValue)) {
    return {
      agentShape: Array.isArray(agentValue) ? "array" : typeof agentValue,
      agentNames: [],
    }
  }

  const agentRecord = agentValue as Record<string, Record<string, unknown>>
  const agentNames = Object.keys(agentRecord).sort()
  const interestingAgents = ["sisyphus", "hephaestus", "prometheus", "atlas"]

  return {
    agentShape: "object",
    agentNames,
    overlays: Object.fromEntries(
      interestingAgents.map((agentName) => {
        const prompt = agentRecord[agentName]?.["prompt"]
        return [
          agentName,
          {
            hasAgent: agentName in agentRecord,
            promptType: typeof prompt,
            promptHasLiteMarker: typeof prompt === "string" ? prompt.includes(LITE_POLICY_MARKER) : false,
          },
        ]
      }),
    ),
  }
}

async function logEvent(logger: RuntimeLogger, event: string, details?: Record<string, unknown>): Promise<void> {
  await logger.log(event, details)
}

const litePlugin: Plugin = async (ctx, options?: LitePluginOptions): Promise<Hooks> => {
  const logger = await createRuntimeLogger()
  await logEvent(logger, "plugin.loaded", {
    ctxDirectory: ctx.directory ?? null,
    cwd: process.cwd(),
    pid: process.pid,
    nodeVersion: process.version,
    logFilePath: logger.filePath,
    pluginOptions: options ?? null,
  })

  const updateCheckHook = createUpdateCheckHook(ctx, logger, options)

  return {
    config: async (config: Record<string, unknown>) => {
      await logEvent(logger, "hook.config.start", {
        commandsBefore: summarizeCommands(config),
        agentsBefore: summarizeAgents(config),
      })

      ensureLiteAgentCommand(config)
      rewriteAgentPrompts(config)

      await logEvent(logger, "hook.config.end", {
        commandsAfter: summarizeCommands(config),
        agentsAfter: summarizeAgents(config),
      })
    },

    "chat.params": async (
      input: {
        sessionID: string
        agent: string
        model: { id: string; providerID: string; [key: string]: unknown }
        provider: { source: string; info: { id?: string; name?: string; [key: string]: unknown }; [key: string]: unknown }
        message: { parts?: Array<{ type?: string; text?: string; [key: string]: unknown }>; role?: string; [key: string]: unknown }
      },
      output: {
        temperature: number
        topP: number
        topK: number
        maxOutputTokens: number | undefined
        options: Record<string, unknown>
      },
    ): Promise<void> => {
      const messageParts = Array.isArray(input.message.parts)
        ? input.message.parts.filter(
            (part): part is { type: string; text?: string; [key: string]: unknown } => typeof part?.type === "string",
          )
        : []

      await logEvent(logger, "hook.chat.params", {
        sessionID: input.sessionID,
        agent: input.agent,
        modelID: input.model.id,
        providerID: input.model.providerID,
        providerSource: input.provider.source,
        messageRole: input.message.role ?? null,
        messageSummary: summarizeParts(messageParts),
        output: {
          temperature: output.temperature,
          topP: output.topP,
          topK: output.topK,
          maxOutputTokens: output.maxOutputTokens ?? null,
        },
      })
    },

    "experimental.chat.system.transform": async (
      input: { sessionID?: string; model: { id: string; providerID: string; [key: string]: unknown } },
      output: { system: string[] },
    ): Promise<void> => {
      const before = {
        systemCount: output.system.length,
        hasLiteMarker: output.system.some((entry) => typeof entry === "string" && entry.includes(LITE_POLICY_MARKER)),
        firstEntryPreview: typeof output.system[0] === "string" ? output.system[0].slice(0, 160) : null,
      }

      injectLiteSystemPrompt(output)

      await logEvent(logger, "hook.experimental.chat.system.transform", {
        sessionID: input.sessionID ?? null,
        modelID: input.model.id,
        providerID: input.model.providerID,
        before,
        after: {
          systemCount: output.system.length,
          hasLiteMarker: output.system.some((entry) => typeof entry === "string" && entry.includes(LITE_POLICY_MARKER)),
          firstEntryPreview: typeof output.system[0] === "string" ? output.system[0].slice(0, 160) : null,
        },
      })
    },

    "command.execute.before": async (
      input: {
        command: string
        sessionID: string
        arguments: string
      },
      output: {
        parts: Array<{ type: string; text?: string; [key: string]: unknown }>
      },
    ): Promise<void> => {
      await logEvent(logger, "hook.command.execute.before", {
        sessionID: input.sessionID,
        command: input.command,
        argumentsSummary: summarizeText(input.arguments),
        outputBeforeSummary: summarizeParts(output.parts),
      })
    },

    "chat.message": async (
      input: {
        sessionID: string
        agent?: string
        model?: {
          providerID: string
          modelID: string
        }
        messageID?: string
        variant?: string
      },
      output: {
        message: { role?: string; [key: string]: unknown }
        parts: Array<{ type: string; text?: string; [key: string]: unknown }>
      },
    ): Promise<void> => {
      await logEvent(logger, "hook.chat.message.received", {
        sessionID: input.sessionID,
        agent: input.agent ?? null,
        modelID: input.model?.modelID ?? null,
        providerID: input.model?.providerID ?? null,
        messageID: input.messageID ?? null,
        variant: input.variant ?? null,
        messageRole: output.message.role ?? null,
        beforeSummary: summarizeParts(output.parts),
      })

      for (const part of output.parts) {
        if (part.type !== "text" || typeof part.text !== "string") {
          continue
        }

        const originalText = part.text
        part.text = rewriteLiteAgentSlashCommand(part.text)
        part.text = rewriteInjectedModeText(part.text)

        if (part.text !== originalText) {
          await logEvent(logger, "hook.chat.message.rewritten", {
            sessionID: input.sessionID,
            before: summarizeText(originalText),
            after: summarizeText(part.text),
          })
        }
      }

      await logEvent(logger, "hook.chat.message.completed", {
        sessionID: input.sessionID,
        afterSummary: summarizeParts(output.parts),
      })
    },

    event: updateCheckHook.event,
  }
}

const pluginModule = {
  id: "lite-my-openagent",
  server: litePlugin,
}

export default pluginModule
