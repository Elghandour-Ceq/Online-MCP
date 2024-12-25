import * as vscode from "vscode"
import os from "os"
import * as path from "path"
import WorkspaceTracker from "../../integrations/workspace/WorkspaceTracker"
import { findLast } from "../../shared/array"
import { ExtensionMessage } from "../../shared/ExtensionMessage"
import { HistoryItem } from "../../shared/HistoryItem"
import { Cline } from "../cline/Cline"
import { ApiProviderManager } from "./api/ApiProviderManager"
import { MessageHandler } from "./message/MessageHandler"
import { StateManager, GlobalStateKey } from "./state/StateManager"
import { TaskManager } from "./task/TaskManager"
import { WebviewManager } from "./webview/WebviewManager"
import { McpHub } from "../../services/mcp/McpHub"

export const GlobalFileNames = {
    apiConversationHistory: "api_conversation_history.json",
    uiMessages: "ui_messages.json",
    openRouterModels: "openrouter_models.json",
    mcpSettings: "zaki_mcp_settings.json",
}

export class ClineProvider implements vscode.WebviewViewProvider {
    public static readonly sideBarId = "claude-dev.SidebarProvider"
    public static readonly tabPanelId = "claude-dev.TabPanelProvider"
    private static activeInstances: Set<ClineProvider> = new Set()
    private view?: vscode.WebviewView | vscode.WebviewPanel
    private cline?: Cline
    private workspaceTracker?: WorkspaceTracker
    mcpHub?: McpHub
    private latestAnnouncementId = "oct-28-2024"
    private stateManager: StateManager
    readonly apiProviderManager: ApiProviderManager
    private taskManager: TaskManager
    private webviewManager: WebviewManager
    private messageHandler: MessageHandler

    constructor(
        readonly context: vscode.ExtensionContext,
        private readonly outputChannel: vscode.OutputChannel,
    ) {
        const cwd = vscode.workspace.workspaceFolders?.map((folder) => folder.uri.fsPath).at(0) ?? path.join(os.homedir(), "Desktop")
        this.outputChannel.appendLine("ZakiProvider instantiated")
        ClineProvider.activeInstances.add(this)
        this.workspaceTracker = new WorkspaceTracker(this)
        this.stateManager = new StateManager(context)
        this.apiProviderManager = new ApiProviderManager(
            this.stateManager,
            context.globalStoragePath,
            GlobalFileNames
        )
        this.mcpHub = new McpHub(this)
        this.taskManager = new TaskManager(
            this.stateManager,
            path.join(cwd, ".zaki"),
            GlobalFileNames
        )
        this.webviewManager = new WebviewManager(
            this.context.extensionUri,
            this.postMessageToWebview.bind(this)
        )
        this.messageHandler = new MessageHandler(
            this.stateManager,
            this.apiProviderManager,
            this.taskManager,
            this.workspaceTracker,
            this.postMessageToWebview.bind(this),
            this.latestAnnouncementId,
            () => this.cline,
            (cline) => { this.cline = cline },
            this.context,
            this,
            this.mcpHub
        )
    }

    async dispose() {
        this.outputChannel.appendLine("Disposing ClineProvider...")
        await this.clearTask()
        this.outputChannel.appendLine("Cleared task")
        if (this.view && "dispose" in this.view) {
            this.view.dispose()
            this.outputChannel.appendLine("Disposed webview")
        }
        this.webviewManager.dispose()
        this.workspaceTracker?.dispose()
        this.workspaceTracker = undefined
        this.mcpHub?.dispose()
		this.mcpHub = undefined
        this.outputChannel.appendLine("Disposed all disposables")
        ClineProvider.activeInstances.delete(this)
    }

    public static getVisibleInstance(): ClineProvider | undefined {
        return findLast(Array.from(this.activeInstances), (instance) => instance.view?.visible === true)
    }

    async resolveWebviewView(
        webviewView: vscode.WebviewView | vscode.WebviewPanel,
    ): Promise<void> {
        this.outputChannel.appendLine("Resolving webview view")
        this.view = webviewView

        this.webviewManager.setupWebview(webviewView)
        this.setWebviewMessageListener(webviewView.webview)

        webviewView.onDidDispose(
            async () => {
                await this.dispose()
            },
            undefined,
            []
        )

        this.clearTask()
        this.outputChannel.appendLine("Webview view resolved")
    }

    private setWebviewMessageListener(webview: vscode.Webview) {
        webview.onDidReceiveMessage(
            async (message) => {
                await this.messageHandler.handleMessage(message)
            },
            undefined,
            []
        )
    }

    // Public methods needed by other parts of the application
    async postMessageToWebview(message: ExtensionMessage) {
        await this.view?.webview.postMessage(message)
    }

    async postStateToWebview() {
        const state = await this.stateManager.getState()
        await this.postMessageToWebview({ 
            type: "state", 
            state: {
                version: this.context.extension?.packageJSON?.version ?? "",
                apiConfiguration: state.apiConfiguration,
                customInstructions: state.customInstructions,
                personality: state.personality,
                alwaysAllowReadOnly: state.alwaysAllowReadOnly,
                uriScheme: vscode.env.uriScheme,
                clineMessages: this.cline?.clineMessages || [],
                taskHistory: (state.taskHistory || []).filter((item) => item.ts && item.task).sort((a, b) => b.ts - a.ts),
                shouldShowAnnouncement: state.lastShownAnnouncementId !== this.latestAnnouncementId,
                extensionActive: state.extensionActive ?? true
            }
        })
    }

    async clearTask() {
        this.cline?.abortTask()
        this.cline = undefined
    }

    async updateTaskHistory(item: HistoryItem): Promise<HistoryItem[]> {
        return this.stateManager.updateTaskHistory(item)
    }

    async getTaskWithId(id: string) {
        return this.taskManager.getTaskWithId(id)
    }

    async initClineWithHistoryItem(historyItem: HistoryItem) {
        await this.clearTask()
        this.cline = await this.taskManager.initClineWithHistoryItem(this, historyItem)
    }

    async updateCustomInstructions(instructions?: string) {
        await this.stateManager.updateGlobalState("customInstructions", instructions || undefined)
        if (this.cline) {
            this.cline.customInstructions = instructions || undefined
        }
        await this.postStateToWebview()
    }

    async updatePersonality(personality?: string) {
        await this.stateManager.updateGlobalState("personality", personality || undefined)
        if (this.cline) {
            this.cline.personality = personality || undefined
        }
        await this.postStateToWebview()
    }

    async getGlobalState(key: GlobalStateKey) {
        return this.stateManager.getGlobalState(key)
    }

    async handleOpenRouterCallback(code: string) {
        const { apiKey, provider } = await this.apiProviderManager.handleOpenRouterCallback(code, this.cline)
        await this.stateManager.updateGlobalState("apiProvider", provider)
        await this.stateManager.storeSecret("openRouterApiKey", apiKey)
        await this.postStateToWebview()
    }

    // New method to set extension active state
    async setExtensionActive(active: boolean) {
        await this.stateManager.updateGlobalState("extensionActive", active);
        await this.postStateToWebview();
    }
}
