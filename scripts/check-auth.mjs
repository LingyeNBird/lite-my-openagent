import { spawnSync } from "node:child_process"

const pnpmCommand = process.platform === "win32"
  ? { command: process.env.ComSpec || "cmd.exe", baseArgs: ["/d", "/s", "/c", "pnpm"] }
  : { command: "pnpm", baseArgs: [] }

function run(args, stdio = "inherit") {
  return spawnSync(pnpmCommand.command, [...pnpmCommand.baseArgs, ...args], { stdio })
}

const whoamiResult = run(["npm", "whoami"], "ignore")

if (whoamiResult.status === 0) {
  process.exit(0)
}

process.stderr.write("pnpm/npm registry login not found. Starting `pnpm login`...\n")

const loginResult = run(["login"])
if (loginResult.status !== 0) {
  process.stderr.write("pnpm login did not complete successfully.\n")
  process.exit(loginResult.status ?? 1)
}

const verifyResult = run(["npm", "whoami"])
if (verifyResult.status !== 0) {
  process.stderr.write("Login completed, but `pnpm npm whoami` still failed. Please verify your registry auth manually.\n")
  process.exit(verifyResult.status ?? 1)
}
