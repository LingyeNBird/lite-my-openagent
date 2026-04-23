import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
const PACKAGE_NAME = "lite-my-openagent";
const NPM_FETCH_TIMEOUT_MS = 5000;
const INSTALL_TIMEOUT_MS = 60000;
const EXACT_SEMVER_REGEX = /^\d+\.\d+\.\d+(-[0-9A-Za-z-]+(\.[0-9A-Za-z-]+)*)?(\+[0-9A-Za-z-]+(\.[0-9A-Za-z-]+)*)?$/;
function isRecord(value) {
    return typeof value === "object" && value !== null;
}
function getDataHome() {
    return process.env["XDG_DATA_HOME"] ?? join(homedir(), ".local", "share");
}
function getCacheHome() {
    return process.env["XDG_CACHE_HOME"] ?? join(homedir(), ".cache");
}
function getOpenCodeConfigDir() {
    const explicit = process.env["OPENCODE_CONFIG_DIR"]?.trim();
    if (explicit) {
        return explicit;
    }
    return join(process.env["XDG_CONFIG_HOME"] ?? join(homedir(), ".config"), "opencode");
}
function getPluginConfigPaths(directory) {
    return [
        join(directory, ".opencode", "opencode.json"),
        join(directory, ".opencode", "opencode.jsonc"),
        join(getOpenCodeConfigDir(), "opencode.json"),
        join(getOpenCodeConfigDir(), "opencode.jsonc"),
    ];
}
function stripJsonComments(content) {
    return content
        .replace(/^\s*\/\/.*$/gm, "")
        .replace(/\/\*[\s\S]*?\*\//g, "");
}
function findPluginEntry(directory) {
    for (const configPath of getPluginConfigPaths(directory)) {
        try {
            if (!existsSync(configPath)) {
                continue;
            }
            const parsed = JSON.parse(stripJsonComments(readFileSync(configPath, "utf8")));
            const plugins = Array.isArray(parsed.plugin) ? parsed.plugin : [];
            for (const item of plugins) {
                const entry = typeof item === "string" ? item : Array.isArray(item) && typeof item[0] === "string" ? item[0] : null;
                if (!entry) {
                    continue;
                }
                if (entry === PACKAGE_NAME) {
                    return { entry, isPinned: false, pinnedVersion: null, configPath };
                }
                if (entry.startsWith(`${PACKAGE_NAME}@`)) {
                    const pinnedVersion = entry.slice(PACKAGE_NAME.length + 1).trim();
                    return {
                        entry,
                        isPinned: EXACT_SEMVER_REGEX.test(pinnedVersion),
                        pinnedVersion,
                        configPath,
                    };
                }
            }
        }
        catch {
            continue;
        }
    }
    return null;
}
function findPackageJsonUp(startDir) {
    let current = startDir;
    for (;;) {
        const candidate = join(current, "package.json");
        if (existsSync(candidate)) {
            return candidate;
        }
        const parent = dirname(current);
        if (parent === current) {
            return null;
        }
        current = parent;
    }
}
function getCurrentVersion() {
    try {
        const currentDir = dirname(fileURLToPath(import.meta.url));
        const packageJsonPath = findPackageJsonUp(currentDir);
        if (!packageJsonPath) {
            return null;
        }
        const pkg = JSON.parse(readFileSync(packageJsonPath, "utf8"));
        return typeof pkg.version === "string" ? pkg.version : null;
    }
    catch {
        return null;
    }
}
async function getLatestVersion(channel) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), NPM_FETCH_TIMEOUT_MS);
    try {
        const response = await fetch(`https://registry.npmjs.org/-/package/${PACKAGE_NAME}/dist-tags`, {
            signal: controller.signal,
            headers: { Accept: "application/json" },
        });
        if (!response.ok) {
            return null;
        }
        const tags = (await response.json());
        const exact = tags[channel];
        if (typeof exact === "string") {
            return exact;
        }
        return typeof tags["latest"] === "string" ? tags["latest"] : null;
    }
    catch {
        return null;
    }
    finally {
        clearTimeout(timeoutId);
    }
}
function extractChannel(version) {
    if (!version) {
        return "latest";
    }
    if (!/^\d/.test(version)) {
        return version;
    }
    const prerelease = version.split("-")[1];
    if (!prerelease) {
        return "latest";
    }
    const channel = prerelease.match(/^(alpha|beta|rc|canary|next)/);
    return channel?.[1] ?? "latest";
}
function getUpdateStrategy(pluginInfo) {
    if (pluginInfo.isPinned) {
        return "pinned";
    }
    if (!pluginInfo.pinnedVersion) {
        return "bare";
    }
    return "tag";
}
function getEffectivePluginSpec(pluginInfo) {
    if (pluginInfo.entry === PACKAGE_NAME) {
        return `${PACKAGE_NAME}@latest`;
    }
    return pluginInfo.entry;
}
function getCacheWorkspaceDir(effectivePluginSpec) {
    return join(getCacheHome(), "opencode", "packages", effectivePluginSpec);
}
function syncCachePackageJson(workspaceDir, intentVersion, logger) {
    try {
        mkdirSync(workspaceDir, { recursive: true });
        const packageJsonPath = join(workspaceDir, "package.json");
        const current = existsSync(packageJsonPath)
            ? JSON.parse(readFileSync(packageJsonPath, "utf8"))
            : {};
        const next = {
            ...current,
            dependencies: {
                ...(current.dependencies ?? {}),
                [PACKAGE_NAME]: intentVersion,
            },
        };
        writeFileSync(packageJsonPath, JSON.stringify(next, null, 2));
        void logger.log("updater.cache_package_json.synced", { packageJsonPath, intentVersion });
        return true;
    }
    catch (error) {
        void logger.log("updater.cache_package_json.failed", {
            intentVersion,
            error: error instanceof Error ? error.message : String(error),
        });
        return false;
    }
}
function invalidateCachedPackage(workspaceDir, logger) {
    const packageDir = join(workspaceDir, "node_modules", PACKAGE_NAME);
    const packageLockPath = join(workspaceDir, "package-lock.json");
    if (existsSync(packageDir)) {
        rmSync(packageDir, { recursive: true, force: true });
        void logger.log("updater.cache_package.removed", { packageDir });
    }
    if (existsSync(packageLockPath)) {
        rmSync(packageLockPath, { force: true });
        void logger.log("updater.cache_lock.removed", { packageLockPath });
    }
}
async function runInstall(workspaceDir, logger) {
    const packageJsonPath = join(workspaceDir, "package.json");
    if (!existsSync(packageJsonPath)) {
        return { success: false, error: `Workspace not initialized: ${packageJsonPath}` };
    }
    return new Promise((resolve) => {
        const isWindows = process.platform === "win32";
        const child = isWindows
            ? spawn("cmd", ["/c", "npm", "install", "--ignore-scripts"], { cwd: workspaceDir, windowsHide: true })
            : spawn("npm", ["install", "--ignore-scripts"], { cwd: workspaceDir });
        let stdout = "";
        let stderr = "";
        const timeoutId = setTimeout(() => {
            child.kill();
            resolve({ success: false, error: `npm install timed out after ${INSTALL_TIMEOUT_MS}ms` });
        }, INSTALL_TIMEOUT_MS);
        child.stdout.on("data", (chunk) => {
            stdout += chunk.toString();
        });
        child.stderr.on("data", (chunk) => {
            stderr += chunk.toString();
        });
        child.on("error", (error) => {
            clearTimeout(timeoutId);
            resolve({ success: false, error: error.message });
        });
        child.on("close", (code) => {
            clearTimeout(timeoutId);
            void logger.log("updater.install.finished", {
                workspaceDir,
                exitCode: code ?? null,
                stdout: stdout.trim().slice(0, 2000),
                stderr: stderr.trim().slice(0, 2000),
            });
            if (code === 0) {
                resolve({ success: true });
                return;
            }
            resolve({ success: false, error: `npm install exited with code ${code ?? "unknown"}` });
        });
    });
}
async function showToast(ctx, title, message, variant = "info") {
    const client = isRecord(ctx.client) ? ctx.client : null;
    const tui = client && isRecord(client["tui"]) ? client["tui"] : null;
    const showToast = tui && typeof tui["showToast"] === "function" ? tui["showToast"] : null;
    if (!showToast) {
        return;
    }
    await Promise.resolve(showToast({
        body: {
            title,
            message,
            variant,
            duration: 5000,
        },
    })).catch(() => undefined);
}
function getOptionBoolean(options, key, fallback) {
    const value = options?.[key];
    return typeof value === "boolean" ? value : fallback;
}
function getParentID(properties) {
    if (!isRecord(properties)) {
        return undefined;
    }
    const info = properties["info"];
    if (!isRecord(info)) {
        return undefined;
    }
    const parentID = info["parentID"];
    return typeof parentID === "string" && parentID.length > 0 ? parentID : undefined;
}
export function createUpdateCheckHook(ctx, logger, options) {
    const autoUpdate = getOptionBoolean(options, "auto_update", true);
    const showUpdateToast = getOptionBoolean(options, "show_update_toast", true);
    let hasChecked = false;
    let hasScheduled = false;
    return {
        event: async ({ event }) => {
            if (event.type !== "session.created") {
                return;
            }
            if (hasChecked || hasScheduled) {
                return;
            }
            if (getParentID(event.properties)) {
                return;
            }
            hasScheduled = true;
            setTimeout(() => {
                hasChecked = true;
                void runUpdateCheck(ctx, logger, { autoUpdate, showUpdateToast });
            }, 1000);
        },
    };
}
async function runUpdateCheck(ctx, logger, options) {
    const pluginInfo = findPluginEntry(ctx.directory);
    await logger.log("updater.check.start", {
        directory: ctx.directory,
        autoUpdate: options.autoUpdate,
        showUpdateToast: options.showUpdateToast,
        pluginEntry: pluginInfo?.entry ?? null,
    });
    if (!pluginInfo) {
        await logger.log("updater.check.skipped", { reason: "plugin_not_found_in_config" });
        return;
    }
    const currentVersion = getCurrentVersion() ?? pluginInfo.pinnedVersion;
    if (!currentVersion) {
        await logger.log("updater.check.skipped", { reason: "current_version_unknown", entry: pluginInfo.entry });
        return;
    }
    const updateStrategy = getUpdateStrategy(pluginInfo);
    const effectivePluginSpec = getEffectivePluginSpec(pluginInfo);
    const workspaceDir = getCacheWorkspaceDir(effectivePluginSpec);
    await logger.log("updater.cache_workspace.resolved", {
        entry: pluginInfo.entry,
        configPath: pluginInfo.configPath,
        effectivePluginSpec,
        workspaceDir,
        strategy: updateStrategy,
    });
    if (updateStrategy !== "pinned") {
        await logger.log("updater.config.non_pinned_entry", {
            entry: pluginInfo.entry,
            configPath: pluginInfo.configPath,
            strategy: updateStrategy,
            note: "Bare package names and dist-tags like @latest depend on opencode cache refresh behavior. Exact versions are more deterministic.",
        });
    }
    const channel = extractChannel(pluginInfo.pinnedVersion ?? currentVersion);
    const latestVersion = await getLatestVersion(channel);
    await logger.log("updater.check.resolved_versions", {
        entry: pluginInfo.entry,
        configPath: pluginInfo.configPath,
        isPinned: pluginInfo.isPinned,
        strategy: updateStrategy,
        currentVersion,
        channel,
        latestVersion,
    });
    if (!latestVersion) {
        await logger.log("updater.check.skipped", { reason: "latest_version_unavailable", channel });
        return;
    }
    if (currentVersion === latestVersion) {
        await logger.log("updater.check.skipped", { reason: "already_latest", currentVersion, channel });
        return;
    }
    if (pluginInfo.isPinned) {
        if (options.showUpdateToast) {
            await showToast(ctx, "lite-my-openagent update available", `v${latestVersion} available. Version is pinned in config.`, "warning");
        }
        await logger.log("updater.check.skipped", { reason: "pinned_version", currentVersion, latestVersion, entry: pluginInfo.entry });
        return;
    }
    if (!options.autoUpdate) {
        if (options.showUpdateToast) {
            await showToast(ctx, "lite-my-openagent update available", `v${latestVersion} available. Auto update is disabled.`, "warning");
        }
        await logger.log("updater.check.skipped", { reason: "auto_update_disabled", currentVersion, latestVersion });
        return;
    }
    const intentVersion = pluginInfo.pinnedVersion ?? "latest";
    if (!syncCachePackageJson(workspaceDir, intentVersion, logger)) {
        if (options.showUpdateToast) {
            await showToast(ctx, "lite-my-openagent update available", `v${latestVersion} available, but cache workspace sync failed.`, "warning");
        }
        return;
    }
    invalidateCachedPackage(workspaceDir, logger);
    const installResult = await runInstall(workspaceDir, logger);
    if (!installResult.success) {
        if (options.showUpdateToast) {
            await showToast(ctx, "lite-my-openagent update available", `v${latestVersion} available, but install failed: ${installResult.error ?? "unknown error"}`, "warning");
        }
        await logger.log("updater.install.failed", {
            currentVersion,
            latestVersion,
            error: installResult.error ?? null,
        });
        return;
    }
    if (options.showUpdateToast) {
        await showToast(ctx, "lite-my-openagent updated", `${currentVersion} → ${latestVersion}. Restart OpenCode to apply.`, "success");
    }
    await logger.log("updater.install.succeeded", { currentVersion, latestVersion, intentVersion });
}
