export type RuntimeLogger = {
    filePath: string;
    log: (event: string, details?: Record<string, unknown>) => Promise<void>;
};
export declare function createRuntimeLogger(): Promise<RuntimeLogger>;
