import { existsSync, mkdirSync, readdirSync, rmSync } from "node:fs"
import { join } from "node:path"
import { spawnSync } from "node:child_process"

const npmPackCommand = process.platform === "win32"
  ? { command: process.env.ComSpec || "cmd.exe", args: ["/d", "/s", "/c", "npm pack --dry-run --ignore-scripts"] }
  : { command: "npm", args: ["pack", "--dry-run", "--ignore-scripts"] }
const outputDir = join(process.cwd(), ".pack-check")
const tscCliPath = join(process.cwd(), "node_modules", "typescript", "bin", "tsc")

function run(command, args) {
  const result = spawnSync(command, args, { stdio: "inherit" })
  if (result.status !== 0) {
    process.exit(result.status ?? 1)
  }
}

if (existsSync(outputDir)) {
  rmSync(outputDir, { recursive: true, force: true })
}

mkdirSync(outputDir, { recursive: true })

rmSync(join(process.cwd(), "dist"), { recursive: true, force: true })
run(process.execPath, [tscCliPath, "-p", "tsconfig.json"])
run(npmPackCommand.command, npmPackCommand.args)

rmSync(outputDir, { recursive: true, force: true })
