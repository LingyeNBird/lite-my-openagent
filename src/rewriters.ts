import {
  LITE_AGENT_COMMAND_NAME,
  LITE_AGENT_COMMAND_TEMPLATE,
  LITE_ANALYZE_MESSAGE,
  LITE_POLICY_MARKER,
  LITE_SEARCH_MESSAGE,
  ORIGINAL_ANALYZE_MESSAGE,
  ORIGINAL_SEARCH_MESSAGE,
  buildAtlasLiteOverlay,
  buildHephaestusLiteOverlay,
  buildPrometheusLiteOverlay,
  buildSisyphusLiteOverlay,
} from "./lite-policy.js"

type PromptableAgent = Record<string, unknown> & { prompt?: unknown }

function prependOverlay(prompt: string, overlay: string): string {
  if (prompt.includes(LITE_POLICY_MARKER)) {
    return prompt
  }

  return `${overlay}\n\n---\n\n${prompt}`
}

export function rewriteAgentPrompts(config: Record<string, unknown>): void {
  const agentRecord = config["agent"]
  if (!agentRecord || typeof agentRecord !== "object" || Array.isArray(agentRecord)) {
    return
  }

  const agents = agentRecord as Record<string, PromptableAgent>

  applyPromptOverlay(agents["sisyphus"], buildSisyphusLiteOverlay())
  applyPromptOverlay(agents["hephaestus"], buildHephaestusLiteOverlay())
  applyPromptOverlay(agents["prometheus"], buildPrometheusLiteOverlay())
  applyPromptOverlay(agents["atlas"], buildAtlasLiteOverlay())
}

function applyPromptOverlay(agent: PromptableAgent | undefined, overlay: string): void {
  if (!agent) {
    return
  }

  if (typeof agent.prompt !== "string") {
    return
  }

  agent.prompt = prependOverlay(agent.prompt, overlay)
}

export function rewriteInjectedModeText(text: string): string {
  let next = text

  next = next.replace(ORIGINAL_SEARCH_MESSAGE, LITE_SEARCH_MESSAGE)
  next = next.replace(ORIGINAL_ANALYZE_MESSAGE, LITE_ANALYZE_MESSAGE)

  next = next.replace(
    /\[search-mode\]\s*MAXIMIZE SEARCH EFFORT\.[\s\S]*?NEVER stop at first result - be exhaustive\./g,
    LITE_SEARCH_MESSAGE,
  )

  next = next.replace(
    /\[analyze-mode\]\s*ANALYSIS MODE\.[\s\S]*?SYNTHESIZE findings before proceeding\.(?:\s*---\s*MANDATORY delegate_task params:[\s\S]*?)?(?=(\n\n---\n\n|$))/g,
    LITE_ANALYZE_MESSAGE,
  )

  return next
}

export function rewriteLiteAgentSlashCommand(text: string): string {
  const trimmed = text.trim()
  const match = trimmed.match(/^\/lite-agent(?:\s+([\s\S]*))?$/i)
  if (!match) {
    return text
  }

  const userRequest = match[1]?.trim() ?? ""
  return LITE_AGENT_COMMAND_TEMPLATE.replace(/\$ARGUMENTS/g, userRequest)
}

export function ensureLiteAgentCommand(config: Record<string, unknown>): void {
  const existingCommands = config["command"]
  const commandRecord =
    existingCommands && typeof existingCommands === "object" && !Array.isArray(existingCommands)
      ? (existingCommands as Record<string, unknown>)
      : {}

  commandRecord[LITE_AGENT_COMMAND_NAME] = {
    name: LITE_AGENT_COMMAND_NAME,
    description: "(lite-my-openagent) Force one request to run under lite subagent constraints",
    template: LITE_AGENT_COMMAND_TEMPLATE,
    argumentHint: "<request>",
  }

  config["command"] = commandRecord
}
