import { LITE_AGENT_COMMAND_NAME, LITE_AGENT_COMMAND_TEMPLATE, LITE_ANALYZE_MESSAGE, LITE_POLICY_MARKER, LITE_SEARCH_MESSAGE, LITE_SYSTEM_PROMPT, ORIGINAL_ANALYZE_MESSAGE, ORIGINAL_SEARCH_MESSAGE, buildAtlasLiteOverlay, buildHephaestusLiteOverlay, buildPrometheusLiteOverlay, buildSisyphusLiteOverlay, } from "./lite-policy.js";
function prependOverlay(prompt, overlay) {
    if (prompt.includes(LITE_POLICY_MARKER)) {
        return prompt;
    }
    return `${overlay}\n\n---\n\n${prompt}`;
}
export function rewriteAgentPrompts(config) {
    const agentRecord = config["agent"];
    if (!agentRecord || typeof agentRecord !== "object" || Array.isArray(agentRecord)) {
        return;
    }
    const agents = agentRecord;
    applyPromptOverlay(agents["sisyphus"], buildSisyphusLiteOverlay());
    applyPromptOverlay(agents["hephaestus"], buildHephaestusLiteOverlay());
    applyPromptOverlay(agents["prometheus"], buildPrometheusLiteOverlay());
    applyPromptOverlay(agents["atlas"], buildAtlasLiteOverlay());
}
function applyPromptOverlay(agent, overlay) {
    if (!agent) {
        return;
    }
    if (typeof agent.prompt !== "string") {
        return;
    }
    agent.prompt = prependOverlay(agent.prompt, overlay);
}
export function rewriteInjectedModeText(text) {
    let next = text;
    next = next.replace(ORIGINAL_SEARCH_MESSAGE, LITE_SEARCH_MESSAGE);
    next = next.replace(ORIGINAL_ANALYZE_MESSAGE, LITE_ANALYZE_MESSAGE);
    next = next.replace(/\[search-mode\]\s*MAXIMIZE SEARCH EFFORT\.[\s\S]*?NEVER stop at first result - be exhaustive\./g, LITE_SEARCH_MESSAGE);
    next = next.replace(/\[analyze-mode\]\s*ANALYSIS MODE\.[\s\S]*?SYNTHESIZE findings before proceeding\.[\s\S]*?Example:\s*delegate_task\(subagent_type="explore", prompt="\.\.\.", run_in_background=true, load_skills=\[\]\)/g, LITE_ANALYZE_MESSAGE);
    return next;
}
export function rewriteLiteAgentSlashCommand(text) {
    const trimmed = text.trim();
    const match = trimmed.match(/^\/lite-agent(?:\s+([\s\S]*))?$/i);
    if (!match) {
        return text;
    }
    const userRequest = match[1]?.trim() ?? "";
    return LITE_AGENT_COMMAND_TEMPLATE.replace(/\$ARGUMENTS/g, userRequest);
}
export function ensureLiteAgentCommand(config) {
    const existingCommands = config["command"];
    const commandRecord = existingCommands && typeof existingCommands === "object" && !Array.isArray(existingCommands)
        ? existingCommands
        : {};
    commandRecord[LITE_AGENT_COMMAND_NAME] = {
        name: LITE_AGENT_COMMAND_NAME,
        description: "(lite-my-openagent) Force one request to run under lite subagent constraints",
        template: LITE_AGENT_COMMAND_TEMPLATE,
        argumentHint: "<request>",
    };
    config["command"] = commandRecord;
}
export function injectLiteSystemPrompt(output) {
    if (!Array.isArray(output.system)) {
        output.system = [LITE_SYSTEM_PROMPT];
        return;
    }
    if (output.system.some((entry) => typeof entry === "string" && entry.includes(LITE_POLICY_MARKER))) {
        return;
    }
    output.system.unshift(LITE_SYSTEM_PROMPT);
}
