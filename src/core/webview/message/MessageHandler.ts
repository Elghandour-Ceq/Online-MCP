import * as vscode from "vscode"
import { buildApiHandler } from "../../../api"
import { selectImages } from "../../../integrations/misc/process-images"
import { openFile, openImage } from "../../../integrations/misc/open-file"
import { openMention } from "../../mentions"
import { WebviewMessage } from "../../../shared/WebviewMessage"
import { ExtensionMessage } from "../../../shared/ExtensionMessage"
import { Cline } from "../../cline/Cline"
import { StateManager, GlobalStateKey } from "../state/StateManager"
import { ApiProviderManager } from "../api/ApiProviderManager"
import { TaskManager } from "../task/TaskManager"
import pWaitFor from "p-wait-for"
import WorkspaceTracker from "../../../integrations/workspace/WorkspaceTracker"
import { ClineProvider } from "../ClineProvider"
import { McpHub } from "../../../services/mcp/McpHub"
export class MessageHandler {
    constructor(
        private readonly stateManager: StateManager,
        private readonly apiProviderManager: ApiProviderManager,
        private readonly taskManager: TaskManager,
        private readonly workspaceTracker: WorkspaceTracker | undefined,
        private readonly postMessage: (message: ExtensionMessage) => Promise<void>,
        private readonly latestAnnouncementId: string,
        private readonly getCline: () => Cline | undefined,
        private readonly setCline: (cline: Cline | undefined) => void,
        private readonly extensionContext: vscode.ExtensionContext,
        private readonly provider: ClineProvider,
        private readonly mcpHub?: McpHub
    ) { }

    async handleMessage(message: WebviewMessage): Promise<void> {
        console.log("MessageHandler", message.type);
        switch (message.type) {
            case "retryUpdate":
                await vscode.commands.executeCommand('zaki.checkForExtensionUpdate');
                break;
            case "webviewDidLaunch":
                await this.handleWebviewLaunch()
                break
            case "newTask":
                await this.handleNewTask(message.text, message.images)
                break
            case "apiConfiguration":
                await this.handleApiConfiguration(message.apiConfiguration)
                break
            case "customInstructions":
                await this.handleCustomInstructions(message.text)
                break
            case "personality":
                await this.handlePersonality(message.text)
                break
            case "alwaysAllowReadOnly":
                await this.handleAlwaysAllowReadOnly(message.bool)
                break
            case "autoApprovalSettings":
                if (message.autoApprovalSettings) {
                    await this.stateManager.updateGlobalState("autoApprovalSettings", message.autoApprovalSettings)
                    if (this.getCline()) {
                        this.getCline()!.autoApprovalSettings = message.autoApprovalSettings
                    }
                    await this.postStateToWebview()
                }
                break
            case "askResponse":
                this.handleAskResponse(message.askResponse!, message.text, message.images)
                break
            case "clearTask":
                await this.handleClearTask()
                break
            case "didShowAnnouncement":
                await this.handleDidShowAnnouncement()
                break
            case "selectImages":
                await this.handleSelectImages()
                break
            case "exportCurrentTask":
                await this.handleExportCurrentTask()
                break
            case "showTaskWithId":
                await this.handleShowTaskWithId(message.text!)
                break
            case "deleteTaskWithId":
                await this.handleDeleteTaskWithId(message.text!)
                break
            case "exportTaskWithId":
                await this.handleExportTaskWithId(message.text!)
                break
            case "resetState":
                await this.handleResetState()
                break
            case "requestOllamaModels":
                await this.handleRequestOllamaModels(message.text)
                break
            case "requestLmStudioModels":
                await this.handleRequestLmStudioModels(message.text)
                break
            case "refreshOpenRouterModels":
                await this.handleRefreshOpenRouterModels()
                break
            case "openImage":
                openImage(message.text!)
                break
            case "openFile":
                openFile(message.text!)
                break
            case "openMention":
                openMention(message.text)
                break
            case "cancelTask":
                await this.handleCancelTask()
                break
            case "openMcpSettings": {
                 const mcpSettingsFilePath = await this.mcpHub?.getMcpSettingsFilePath()
                 if (mcpSettingsFilePath) {
                        openFile(mcpSettingsFilePath)
                 }
                 break
                }
            case "restartMcpServer": {
                    try {
                        await this.mcpHub?.restartConnection(message.text!)
                    } catch (error) {
                        console.error(`Failed to retry connection for ${message.text}:`, error)
                    }
                    break
                }
        }
    }

    private async handleWebviewLaunch(): Promise<void> {
        await this.postStateToWebview()
        this.workspaceTracker?.initializeFilePaths()

        // Ensure MCP servers are initialized and synced
        if (this.mcpHub) {
            await this.mcpHub.initialize()
        }

        const cachedModels = await this.apiProviderManager.readOpenRouterModels()
        if (cachedModels) {
            await this.postMessage({ type: "openRouterModels", openRouterModels: cachedModels })
        }

        const refreshedModels = await this.apiProviderManager.refreshOpenRouterModels()
        if (refreshedModels) {
            const state = await this.stateManager.getState()
            if (state.apiConfiguration.openRouterModelId) {
                await this.stateManager.updateGlobalState(
                    "openRouterModelInfo",
                    refreshedModels[state.apiConfiguration.openRouterModelId]
                )
                await this.postStateToWebview()
            }
        }
    }

    private async handleNewTask(task?: string, images?: string[]): Promise<void> {
        const cline = await this.taskManager.initClineWithTask(this.provider, task, images)
        this.setCline(cline)
    }

    private async handleApiConfiguration(apiConfiguration: any): Promise<void> {
        if (apiConfiguration) {
            const {
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
            } = apiConfiguration

            await this.stateManager.updateGlobalState("apiProvider", apiProvider)
            await this.stateManager.updateGlobalState("apiModelId", apiModelId)
            await this.stateManager.storeSecret("apiKey", apiKey)
            await this.stateManager.storeSecret("openRouterApiKey", openRouterApiKey)
            await this.stateManager.storeSecret("awsAccessKey", awsAccessKey)
            await this.stateManager.storeSecret("awsSecretKey", awsSecretKey)
            await this.stateManager.storeSecret("awsSessionToken", awsSessionToken)
            await this.stateManager.updateGlobalState("awsRegion", awsRegion)
            await this.stateManager.updateGlobalState("awsUseCrossRegionInference", awsUseCrossRegionInference)
            await this.stateManager.updateGlobalState("vertexProjectId", vertexProjectId)
            await this.stateManager.updateGlobalState("vertexRegion", vertexRegion)
            await this.stateManager.updateGlobalState("openAiBaseUrl", openAiBaseUrl)
            await this.stateManager.storeSecret("openAiApiKey", openAiApiKey)
            await this.stateManager.updateGlobalState("openAiModelId", openAiModelId)
            await this.stateManager.updateGlobalState("ollamaModelId", ollamaModelId)
            await this.stateManager.updateGlobalState("ollamaBaseUrl", ollamaBaseUrl)
            await this.stateManager.updateGlobalState("lmStudioModelId", lmStudioModelId)
            await this.stateManager.updateGlobalState("lmStudioBaseUrl", lmStudioBaseUrl)
            await this.stateManager.updateGlobalState("anthropicBaseUrl", anthropicBaseUrl)
            await this.stateManager.storeSecret("geminiApiKey", geminiApiKey)
            await this.stateManager.storeSecret("openAiNativeApiKey", openAiNativeApiKey)
            await this.stateManager.updateGlobalState("azureApiVersion", azureApiVersion)
            await this.stateManager.updateGlobalState("openRouterModelId", openRouterModelId)
            await this.stateManager.updateGlobalState("openRouterModelInfo", openRouterModelInfo)

            const cline = this.getCline()
            if (cline) {
                cline.api = buildApiHandler(apiConfiguration)
            }
        }
        await this.postStateToWebview()
    }

    private async handleCustomInstructions(instructions?: string): Promise<void> {
        await this.provider.updateCustomInstructions(instructions)
    }

    private async handlePersonality(personality?: string): Promise<void> {
        await this.provider.updatePersonality(personality)
    }

    private async handleAlwaysAllowReadOnly(value?: boolean): Promise<void> {
        await this.stateManager.updateGlobalState("alwaysAllowReadOnly", value ?? undefined)
        const cline = this.getCline()
        if (cline) {
            cline.alwaysAllowReadOnly = value ?? false
        }
        await this.postStateToWebview()
    }

    private handleAskResponse(askResponse: any, text?: string, images?: string[]): void {
        const cline = this.getCline()
        cline?.handleWebviewAskResponse(askResponse, text, images)
    }

    private async handleClearTask(): Promise<void> {
        const cline = this.getCline()
        cline?.abortTask()
        this.setCline(undefined)
        await this.postStateToWebview()
    }

    private async handleDidShowAnnouncement(): Promise<void> {
        await this.stateManager.updateGlobalState("lastShownAnnouncementId", this.latestAnnouncementId)
        await this.postStateToWebview()
    }

    private async handleSelectImages(): Promise<void> {
        const images = await selectImages()
        await this.postMessage({ type: "selectedImages", images })
    }

    private async handleExportCurrentTask(): Promise<void> {
        const currentTaskId = this.getCline()?.taskId
        if (currentTaskId) {
            await this.taskManager.exportTaskWithId(currentTaskId)
        }
    }

    private async handleShowTaskWithId(id: string): Promise<void> {
        console.log("handleShowTaskWithId");
        try {
            const cline = this.getCline()
            if (id !== cline?.taskId) {
                const { historyItem } = await this.taskManager.getTaskWithId(id)
                const newCline = await this.taskManager.initClineWithHistoryItem(this.provider, historyItem)
                console.log("handleShowTaskWithId2",historyItem);
                this.setCline(newCline)
                console.log("handleShowTaskWithId3",newCline);
            }
            
            await this.postMessage({ type: "action", action: "chatButtonClicked" })
            console.log("handleShowTaskWithId4");
        } catch (err) { console.error(err) }
    }

    private async handleDeleteTaskWithId(id: string): Promise<void> {
        await this.taskManager.deleteTaskWithId(id, this.getCline())
        await this.postStateToWebview()
    }

    private async handleExportTaskWithId(id: string): Promise<void> {
        await this.taskManager.exportTaskWithId(id)
    }

    private async handleResetState(): Promise<void> {
        vscode.window.showInformationMessage("Resetting state...")
        await this.stateManager.resetState()
        const cline = this.getCline()
        if (cline) {
            cline.abortTask()
            this.setCline(undefined)
        }
        vscode.window.showInformationMessage("State reset")
        await this.postStateToWebview()
        await this.postMessage({ type: "action", action: "chatButtonClicked" })
    }

    private async handleRequestOllamaModels(baseUrl?: string): Promise<void> {
        const models = await this.apiProviderManager.getOllamaModels(baseUrl)
        await this.postMessage({ type: "ollamaModels", ollamaModels: models })
    }

    private async handleRequestLmStudioModels(baseUrl?: string): Promise<void> {
        const models = await this.apiProviderManager.getLmStudioModels(baseUrl)
        await this.postMessage({ type: "lmStudioModels", lmStudioModels: models })
    }

    private async handleRefreshOpenRouterModels(): Promise<void> {
        const models = await this.apiProviderManager.refreshOpenRouterModels()
        await this.postMessage({ type: "openRouterModels", openRouterModels: models })
    }

    private async handleCancelTask(): Promise<void> {
        const cline = this.getCline()
        if (cline) {
            const { historyItem } = await this.taskManager.getTaskWithId(cline.taskId)
            cline.abortTask()
            await pWaitFor(() => {
                const currentCline = this.getCline()
                return currentCline === undefined || currentCline.didFinishAborting === true
            }, {
                timeout: 3_000,
            }).catch(() => {
                console.error("Failed to abort task")
            })
            const currentCline = this.getCline()
            if (currentCline) {
                currentCline.abandoned = true
            }
            const newCline = await this.taskManager.initClineWithHistoryItem(this.provider, historyItem)
            this.setCline(newCline)
        }
    }

    private async postStateToWebview(): Promise<void> {
        const state = await this.stateManager.getState()
        
        await this.postMessage({ 
            type: "state", 
            state: {
                version: this.extensionContext.extension?.packageJSON?.version ?? "",
                apiConfiguration: state.apiConfiguration,
                customInstructions: state.customInstructions,
                personality: state.personality,
                alwaysAllowReadOnly: state.alwaysAllowReadOnly,
                uriScheme: vscode.env.uriScheme,
                clineMessages: this.getCline()?.clineMessages || [],
                taskHistory: (state.taskHistory || []).filter((item) => item.ts && item.task).sort((a, b) => b.ts - a.ts),
                shouldShowAnnouncement: state.lastShownAnnouncementId !== this.latestAnnouncementId,
                extensionActive: state.extensionActive ?? true, // Default to true if not set
                autoApprovalSettings: state.autoApprovalSettings
            }
        })
    }
}
