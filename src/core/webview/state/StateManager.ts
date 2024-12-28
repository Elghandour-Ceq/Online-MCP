import * as vscode from "vscode"
import * as path from "path"
import * as fs from "fs/promises"
import { ApiProvider, ModelInfo } from "../../../shared/api"
import { HistoryItem } from "../../../shared/HistoryItem"
import { readJsonFile, writeJsonFile, ensureJsonDirectory } from "../../../utils/json-storage"
import { AutoApprovalSettings, DEFAULT_AUTO_APPROVAL_SETTINGS } from "../../../shared/AutoApprovalSettings"

export type SecretKey =
    | "apiKey"
    | "openRouterApiKey"
    | "awsAccessKey"
    | "awsSecretKey"
    | "awsSessionToken"
    | "openAiApiKey"
    | "geminiApiKey"
    | "openAiNativeApiKey"

export type GlobalStateKey =
    | "apiProvider"
    | "apiModelId"
    | "awsRegion"
    | "awsUseCrossRegionInference"
    | "vertexProjectId"
    | "vertexRegion"
    | "lastShownAnnouncementId"
    | "customInstructions"
    | "personality"
    | "taskHistory"
    | "openAiBaseUrl"
    | "openAiModelId"
    | "ollamaModelId"
    | "ollamaBaseUrl"
    | "lmStudioModelId"
    | "lmStudioBaseUrl"
    | "anthropicBaseUrl"
    | "azureApiVersion"
    | "openRouterModelId"
    | "openRouterModelInfo"
    | "extensionActive"  // New key to track extension activation status
    | "autoApprovalSettings"

type ProjectFileConfig = {
    key: "taskHistory" | "personality" | "customInstructions";
    filename: string;
    defaultValue: any;
}

export class StateManager {
    private readonly PROJECT_FILES: ProjectFileConfig[] = [
        { key: "taskHistory", filename: "task_history.json", defaultValue: [] },
        { key: "personality", filename: "personality.json", defaultValue: "" },
        { key: "customInstructions", filename: "custom_instructions.json", defaultValue: "" }
    ];

    constructor(private readonly context: vscode.ExtensionContext) {
        this.excludeZakiFolder();
    }



    async setExtensionActive(isActive: boolean) {
        await this.updateGlobalState("extensionActive", isActive);
    }

    // New method to check extension active status
    async isExtensionActive(): Promise<boolean> {
        const status = await this.getGlobalState("extensionActive");
        return status === undefined ? true : !!status;
    }

    private async excludeZakiFolder() {
        try {
            const config = vscode.workspace.getConfiguration();
            const filesExclude = config.get('files.exclude') as { [key: string]: boolean };
            
            if (!filesExclude['.zaki']) {
                filesExclude['.zaki'] = true;
                // Use ConfigurationTarget.Global if no workspace is available
                const target = vscode.workspace.workspaceFolders 
                    ? vscode.ConfigurationTarget.Workspace 
                    : vscode.ConfigurationTarget.Global;
                
                await config.update('files.exclude', filesExclude, target);
                console.log('[DEBUG] Added .zaki folder to files.exclude');
            }
        } catch (error) {
            // Log error but don't throw - allow the extension to continue functioning
            console.warn('[WARN] Failed to exclude .zaki folder:', error);
        }
    }

    private async getProjectFilePath(filename: string): Promise<string | undefined> {
        const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (workspaceRoot) {
            return path.join(workspaceRoot, ".zaki", filename);
        }
        return undefined;
    }

    private async handleProjectFile<T>(key: ProjectFileConfig["key"], value?: T): Promise<T | undefined> {
        const config = this.PROJECT_FILES.find(f => f.key === key);
        if (!config) {return undefined};

        const filePath = await this.getProjectFilePath(config.filename);
        if (!filePath) {return undefined};

        if (value === undefined) {
            // Read operation
            console.log(`[DEBUG] Reading project-level ${key}`);
            const data = await readJsonFile<T>(filePath, {
                warningMessage: `${key} file is corrupted. ${key} will be reset.`,
                defaultValue: config.defaultValue,
                createBackup: false,
                resetOnError: false
            });

            // For arrays (like taskHistory), only return if not empty
            if (Array.isArray(data)) {
                return data.length > 0 ? data : undefined;
            }
            return data;
        } else {
            // Write operation
            console.log(`[DEBUG] Writing project-level ${key}`);
            await ensureJsonDirectory(path.dirname(filePath));
            await writeJsonFile(filePath, value, true);
            return value;
        }
    }

    async updateGlobalState(key: GlobalStateKey, value: any) {
        const projectFile = this.PROJECT_FILES.find(f => f.key === key);
        if (projectFile) {
            console.log(`[DEBUG] Updating ${key}`);
            const projectValue = await this.handleProjectFile(projectFile.key, value);
            if (projectValue === undefined) {
                await this.context.globalState.update(key, value);
            }
        } else {
            await this.context.globalState.update(key, value);
        }
    }

    async getGlobalState(key: GlobalStateKey) {
        const projectFile = this.PROJECT_FILES.find(f => f.key === key);
        if (projectFile) {
            console.log(`[DEBUG] Getting ${key}`);
            const projectValue = await this.handleProjectFile(projectFile.key);
            if (projectValue !== undefined) {
                return projectValue;
            }
        }
        return await this.context.globalState.get(key);
    }

    async storeSecret(key: SecretKey, value?: string) {
        if (value) {
            await this.context.secrets.store(key, value)
        } else {
            await this.context.secrets.delete(key)
        }
    }

    async getSecret(key: SecretKey) {
        return await this.context.secrets.get(key)
    }

    async getState() {
        const [
            storedApiProvider,
            apiModelId,
            apiKey,
            openRouterApiKey,
            awsAccessKey,
            awsSecretKey,
            awsSessionToken,
            awsRegion,
            awsUseCrossRegionInference,
            vertexProjectId,
            vertexRegion,
            openAiBaseUrl,
            openAiApiKey,
            openAiModelId,
            ollamaModelId,
            ollamaBaseUrl,
            lmStudioModelId,
            lmStudioBaseUrl,
            anthropicBaseUrl,
            geminiApiKey,
            openAiNativeApiKey,
            azureApiVersion,
            openRouterModelId,
            openRouterModelInfo,
            lastShownAnnouncementId,
            customInstructions,
            personality,
            taskHistory,
            autoApprovalSettings,
        ] = await Promise.all([
            this.getGlobalState("apiProvider") as Promise<ApiProvider | undefined>,
            this.getGlobalState("apiModelId") as Promise<string | undefined>,
            this.getSecret("apiKey") as Promise<string | undefined>,
            this.getSecret("openRouterApiKey") as Promise<string | undefined>,
            this.getSecret("awsAccessKey") as Promise<string | undefined>,
            this.getSecret("awsSecretKey") as Promise<string | undefined>,
            this.getSecret("awsSessionToken") as Promise<string | undefined>,
            this.getGlobalState("awsRegion") as Promise<string | undefined>,
            this.getGlobalState("awsUseCrossRegionInference") as Promise<boolean | undefined>,
            this.getGlobalState("vertexProjectId") as Promise<string | undefined>,
            this.getGlobalState("vertexRegion") as Promise<string | undefined>,
            this.getGlobalState("openAiBaseUrl") as Promise<string | undefined>,
            this.getSecret("openAiApiKey") as Promise<string | undefined>,
            this.getGlobalState("openAiModelId") as Promise<string | undefined>,
            this.getGlobalState("ollamaModelId") as Promise<string | undefined>,
            this.getGlobalState("ollamaBaseUrl") as Promise<string | undefined>,
            this.getGlobalState("lmStudioModelId") as Promise<string | undefined>,
            this.getGlobalState("lmStudioBaseUrl") as Promise<string | undefined>,
            this.getGlobalState("anthropicBaseUrl") as Promise<string | undefined>,
            this.getSecret("geminiApiKey") as Promise<string | undefined>,
            this.getSecret("openAiNativeApiKey") as Promise<string | undefined>,
            this.getGlobalState("azureApiVersion") as Promise<string | undefined>,
            this.getGlobalState("openRouterModelId") as Promise<string | undefined>,
            this.getGlobalState("openRouterModelInfo") as Promise<ModelInfo | undefined>,
            this.getGlobalState("lastShownAnnouncementId") as Promise<string | undefined>,
            this.getGlobalState("customInstructions") as Promise<string | undefined>,
            this.getGlobalState("personality") as Promise<string | undefined>,
            this.getGlobalState("taskHistory") as Promise<HistoryItem[] | undefined>,
            this.getGlobalState("autoApprovalSettings") as Promise<AutoApprovalSettings | undefined>,
        ])

        const isActive = await this.isExtensionActive();

        let apiProvider: ApiProvider
        if (storedApiProvider) {
            apiProvider = storedApiProvider
        } else {
            if (apiKey) {
                apiProvider = "anthropic"
            } else {
                apiProvider = "openrouter"
            }
        }

        return {
            apiConfiguration: {
                apiProvider,
                apiModelId,
                apiKey,
                openRouterApiKey,
                awsAccessKey,
                awsSecretKey,
                awsSessionToken,
                awsRegion,
                awsUseCrossRegionInference,
                vertexProjectId,
                vertexRegion,
                openAiBaseUrl,
                openAiApiKey,
                openAiModelId,
                ollamaModelId,
                ollamaBaseUrl,
                lmStudioModelId,
                lmStudioBaseUrl,
                anthropicBaseUrl,
                geminiApiKey,
                openAiNativeApiKey,
                azureApiVersion,
                openRouterModelId,
                openRouterModelInfo,
            },
            lastShownAnnouncementId,
            customInstructions,
            personality,
            taskHistory,
            extensionActive: isActive,
            autoApprovalSettings: autoApprovalSettings || DEFAULT_AUTO_APPROVAL_SETTINGS
        };
    }

    async updateTaskHistory(item: HistoryItem): Promise<HistoryItem[]> {
        console.log("[DEBUG] Updating task history with item:", item.id);
        const history = await this.getGlobalState("taskHistory") as HistoryItem[] || [];
        const existingItemIndex = history.findIndex((h) => h.id === item.id);
        
        if (existingItemIndex !== -1) {
            history[existingItemIndex] = item;
        } else {
            history.push(item);
        }
        
        await this.updateGlobalState("taskHistory", history);
        return history;
    }

    async resetState() {
        // Reset project-level files
        await Promise.all(
            this.PROJECT_FILES.map(async ({ filename, key }) => {
                const filePath = await this.getProjectFilePath(filename);
                if (filePath) {
                    console.log(`[DEBUG] Resetting project-level ${key}`);
                    try {
                        await fs.unlink(filePath);
                    } catch (error) {
                        console.error(`[ERROR] Failed to delete ${key}:`, error);
                    }
                }
            })
        );

        // Reset global state
        for (const key of this.context.globalState.keys()) {
            await this.context.globalState.update(key, undefined)
        }
        
        const secretKeys: SecretKey[] = [
            "apiKey",
            "openRouterApiKey",
            "awsAccessKey",
            "awsSecretKey",
            "awsSessionToken",
            "openAiApiKey",
            "geminiApiKey",
            "openAiNativeApiKey",
        ]
        for (const key of secretKeys) {
            await this.storeSecret(key, undefined)
        }
    }
}
