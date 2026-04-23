import { mkdirSync, readFileSync, writeFileSync } from "fs"
import { join } from "path"

import { LITE_AGENT_COMMAND_FILE_CONTENT } from "./lite-policy.js"

export function ensureLiteAgentCommandFile(directory: string | undefined): void {
  if (!directory) {
    return
  }

  const commandsDir = join(directory, ".opencode", "commands")
  const commandFilePath = join(commandsDir, "lite-agent.md")

  mkdirSync(commandsDir, { recursive: true })

  try {
    const existing = readFileSync(commandFilePath, "utf8")
    if (existing === LITE_AGENT_COMMAND_FILE_CONTENT) {
      return
    }
  } catch {
    // File does not exist or is unreadable; overwrite below.
  }

  writeFileSync(commandFilePath, LITE_AGENT_COMMAND_FILE_CONTENT, "utf8")
}
