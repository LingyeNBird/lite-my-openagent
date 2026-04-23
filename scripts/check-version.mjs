import { spawnSync } from "node:child_process"
import packageJson from "../package.json" with { type: "json" }

const version = process.argv[2]
const packageName = process.argv[3]

if (!version) {
  throw new Error("VERSION argument is required.")
}

if (!packageName) {
  throw new Error("PACKAGE_NAME argument is required.")
}

if (!/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(version)) {
  throw new Error("VERSION must look like 0.1.1 or 0.1.1-beta.1")
}

if (packageJson.version === version) {
  throw new Error(`package.json already has version ${version}`)
}

const pnpmCmd = process.platform === "win32" ? "pnpm.cmd" : "pnpm"
const publishedCheck = spawnSync(pnpmCmd, ["view", `${packageName}@${version}`, "version"], {
  stdio: "ignore",
})

if (publishedCheck.status === 0) {
  throw new Error(`${packageName}@${version} is already published`)
}
