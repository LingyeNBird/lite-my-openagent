import { homedir } from "node:os"
import { join } from "node:path"
import { mkdir, readdir, rm, writeFile, appendFile } from "node:fs/promises"

export type RuntimeLogger = {
  filePath: string
  log: (event: string, details?: Record<string, unknown>) => Promise<void>
}

const LOG_DIR_NAME = "lite-my-openagent"

function pad2(value: number): string {
  return value.toString().padStart(2, "0")
}

function getLogDirectory(): string {
  const localAppData = process.env["LOCALAPPDATA"]
  if (typeof localAppData === "string" && localAppData.length > 0) {
    return join(localAppData, LOG_DIR_NAME)
  }

  return join(homedir(), "AppData", "Local", LOG_DIR_NAME)
}

function getDatePrefix(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`
}

function getTimestampFileName(date: Date): string {
  return `${getDatePrefix(date)}_${pad2(date.getHours())}-${pad2(date.getMinutes())}-${pad2(date.getSeconds())}-${date.getMilliseconds().toString().padStart(3, "0")}.log`
}

function serializeDetails(details: Record<string, unknown> | undefined): string {
  if (!details || Object.keys(details).length === 0) {
    return ""
  }

  return ` ${JSON.stringify(details)}`
}

async function removeStaleLogs(logDirectory: string, now: Date): Promise<number> {
  const todayPrefix = getDatePrefix(now)

  const entries = await readdir(logDirectory, { withFileTypes: true })
  const staleLogNames = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".log") && entry.name.slice(0, 10) < todayPrefix)
    .map((entry) => entry.name)

  await Promise.all(staleLogNames.map((fileName) => rm(join(logDirectory, fileName), { force: true })))
  return staleLogNames.length
}

export async function createRuntimeLogger(): Promise<RuntimeLogger> {
  const now = new Date()
  const logDirectory = getLogDirectory()

  try {
    await mkdir(logDirectory, { recursive: true })
    const removedCount = await removeStaleLogs(logDirectory, now)
    const filePath = join(logDirectory, getTimestampFileName(now))

    await writeFile(
      filePath,
      `[${now.toISOString()}] runtime.init ${JSON.stringify({ logDirectory, removedStaleLogs: removedCount })}\n`,
      "utf8",
    )

    return {
      filePath,
      async log(event: string, details?: Record<string, unknown>): Promise<void> {
        try {
          const line = `[${new Date().toISOString()}] ${event}${serializeDetails(details)}\n`
          await appendFile(filePath, line, "utf8")
        } catch (error) {
          const message = error instanceof Error ? error.stack ?? error.message : String(error)
          console.error(`[lite-my-openagent] failed to append runtime log: ${message}`)
        }
      },
    }
  } catch (error) {
    const message = error instanceof Error ? error.stack ?? error.message : String(error)
    console.error(`[lite-my-openagent] failed to initialize runtime logger: ${message}`)

    return {
      filePath: join(logDirectory, "logger-init-failed.log"),
      async log(event: string, details?: Record<string, unknown>): Promise<void> {
        console.error(
          `[lite-my-openagent] skipped log event ${event}: ${JSON.stringify({ details, reason: "logger init failed" })}`,
        )
      },
    }
  }
}
