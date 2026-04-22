import { rewriteAgentPrompts, rewriteInjectedModeText } from "./rewriters.js";
const litePlugin = async () => {
    return {
        config: async (config) => {
            rewriteAgentPrompts(config);
        },
        "chat.message": async (_input, output) => {
            for (const part of output.parts) {
                if (part.type !== "text" || typeof part.text !== "string") {
                    continue;
                }
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
