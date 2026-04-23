import { spawnSync } from "node:child_process"

const pnpmCmd = process.platform === "win32" ? "pnpm.cmd" : "pnpm"

function run(args, stdio = "inherit") {
  return spawnSync(pnpmCmd, args, { stdio })
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
