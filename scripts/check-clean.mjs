import { spawnSync } from "node:child_process"

function runGit(args) {
  return spawnSync("git", args, { encoding: "utf8" })
}

const branchResult = runGit(["rev-parse", "--abbrev-ref", "HEAD"])
if (branchResult.status !== 0) {
  process.stderr.write(branchResult.stderr || "Failed to resolve current branch.\n")
  process.exit(branchResult.status ?? 1)
}

const branch = branchResult.stdout.trim()
if (branch !== "main") {
  process.stderr.write("Release must run from main branch.\n")
  process.exit(1)
}

const unstaged = runGit(["diff", "--quiet"])
if (unstaged.status !== 0) {
  process.stderr.write("Working tree has unstaged changes. Please commit, stash, or discard them before publishing.\n")
  process.exit(1)
}

const staged = runGit(["diff", "--cached", "--quiet"])
if (staged.status !== 0) {
  process.stderr.write("Working tree has staged but uncommitted changes. Please commit or unstage them before publishing.\n")
  process.exit(1)
}
