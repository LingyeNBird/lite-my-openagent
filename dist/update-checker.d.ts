import type { RuntimeLogger } from "./runtime-log.js";
type LitePluginOptions = {
    auto_update?: boolean;
    show_update_toast?: boolean;
};
type PluginInputLike = {
    client?: unknown;
    directory: string;
};
export declare function createUpdateCheckHook(ctx: PluginInputLike, logger: RuntimeLogger, options?: LitePluginOptions): {
    event: ({ event }: {
        event: {
            type: string;
            properties?: unknown;
        };
    }) => Promise<void>;
};
export {};
