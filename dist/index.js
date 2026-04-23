import { ensureLiteAgentCommand, injectLiteSystemPrompt, rewriteAgentPrompts, rewriteInjectedModeText, rewriteLiteAgentSlashCommand, } from "./rewriters.js";
const litePlugin = async (ctx) => {
    return {
        config: async (config) => {
            ensureLiteAgentCommand(config);
            rewriteAgentPrompts(config);
        },
        "experimental.chat.system.transform": async (_input, output) => {
            injectLiteSystemPrompt(output);
        },
        "chat.message": async (_input, output) => {
            for (const part of output.parts) {
                if (part.type !== "text" || typeof part.text !== "string") {
                    continue;
                }
                part.text = rewriteLiteAgentSlashCommand(part.text);
                part.text = rewriteInjectedModeText(part.text);
            }
        },
    };
};
const pluginModule = {
    id: "lite-my-openagent",
    server: litePlugin,
};
export default pluginModule;
