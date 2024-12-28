import { Anthropic } from "@anthropic-ai/sdk"
import * as fs from "fs/promises"
import * as path from "path"
import * as vscode from "vscode"
import { downloadTask } from "../../../integrations/misc/export-markdown"
import { HistoryItem } from "../../../shared/HistoryItem"
import { fileExistsAtPath } from "../../../utils/fs"
import { readJsonFile, writeJsonFile } from "../../../utils/json-storage"
import { Cline } from "../../cline/Cline"
import { StateManager } from "../state/StateManager"
import { ClineProvider } from "../ClineProvider"
import { AutoApprovalSettings, DEFAULT_AUTO_APPROVAL_SETTINGS } from "../../../shared/AutoApprovalSettings"

export interface TaskFiles {
    historyItem: HistoryItem
    taskDirPath: string
    apiConversationHistoryFilePath: string
    uiMessagesFilePath: string
    apiConversationHistory: Anthropic.MessageParam[]
}

export class TaskManager {
    constructor(
        private readonly stateManager: StateManager,
        private readonly globalStoragePath: string,
        private readonly globalFileNames: {
            apiConversationHistory: string
            uiMessages: string
        }
    ) { }

    private async getTaskStoragePath(id: string): Promise<{ taskDirPath: string; isProjectLevel: boolean }> {
        console.log("[DEBUG] Getting task storage path");
        
        // Try project-level storage first
        const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (workspaceRoot) {
            const projectTaskDir = path.join(workspaceRoot, ".zaki", "tasks", id);
            const projectApiHistoryPath = path.join(projectTaskDir, this.globalFileNames.apiConversationHistory);
            console.log(`[DEBUG] Checking project-level storage at: ${projectTaskDir}`);
            
            if (await fileExistsAtPath(projectApiHistoryPath)) {
                console.log("[DEBUG] Found task in project-level storage");
                return { taskDirPath: projectTaskDir, isProjectLevel: true };
            }
        }

        // Fall back to global storage
        console.log("[DEBUG] Task not found in project storage, checking global storage");
        const globalTaskDir = path.join(this.globalStoragePath, "tasks", id);
        return { taskDirPath: globalTaskDir, isProjectLevel: false };
    }

    async getTaskWithId(id: string): Promise<TaskFiles> {
        console.log("[DEBUG] getTaskWithId called for id:", id);
        const history = ((await this.stateManager.getGlobalState("taskHistory")) as HistoryItem[] | undefined) || []
        const historyItem = history.find((item) => item.id === id)
        
        if (historyItem) {
            const { taskDirPath, isProjectLevel } = await this.getTaskStoragePath(id);
            console.log(`[DEBUG] Using ${isProjectLevel ? "project-level" : "global"} storage at: ${taskDirPath}`);

            const apiConversationHistoryFilePath = path.join(taskDirPath, this.globalFileNames.apiConversationHistory)
            const uiMessagesFilePath = path.join(taskDirPath, this.globalFileNames.uiMessages)
            
            const apiConversationHistory = await readJsonFile<Anthropic.MessageParam[]>(apiConversationHistoryFilePath, {
                warningMessage: "API conversation history is corrupted. Task will be reset to prevent initialization issues.",
                defaultValue: [],
                createBackup: true,
                resetOnError: true
            })

            if (apiConversationHistory) {
                return {
                    historyItem,
                    taskDirPath,
                    apiConversationHistoryFilePath,
                    uiMessagesFilePath,
                    apiConversationHistory,
                }
            }
        }
        console.log("[DEBUG] Task not found");
        throw new Error("Task not found")
    }

    async exportTaskWithId(id: string): Promise<void> {
        console.log("[DEBUG] Exporting task with id:", id);
        const { historyItem, apiConversationHistory } = await this.getTaskWithId(id)
        await downloadTask(historyItem.ts, apiConversationHistory)
    }

    async deleteTaskWithId(id: string, currentCline?: Cline): Promise<void> {
        console.log("[DEBUG] Deleting task with id:", id);
        if (id === currentCline?.taskId) {
            currentCline.abortTask()
        }

        const { taskDirPath, apiConversationHistoryFilePath, uiMessagesFilePath } = await this.getTaskWithId(id)

        const apiConversationHistoryFileExists = await fileExistsAtPath(apiConversationHistoryFilePath)
        if (apiConversationHistoryFileExists) {
            console.log("[DEBUG] Deleting API conversation history file");
            await fs.unlink(apiConversationHistoryFilePath)
        }
        const uiMessagesFileExists = await fileExistsAtPath(uiMessagesFilePath)
        if (uiMessagesFileExists) {
            console.log("[DEBUG] Deleting UI messages file");
            await fs.unlink(uiMessagesFilePath)
        }
        const legacyMessagesFilePath = path.join(taskDirPath, "claude_messages.json")
        if (await fileExistsAtPath(legacyMessagesFilePath)) {
            console.log("[DEBUG] Deleting legacy messages file");
            await fs.unlink(legacyMessagesFilePath)
        }
        await fs.rmdir(taskDirPath)
        console.log("[DEBUG] Task directory deleted");
    }

    async initClineWithTask(
        provider: ClineProvider,
        task?: string,
        images?: string[]
    ): Promise<Cline> {
        console.log("[DEBUG] Initializing Cline with new task");
        const { apiConfiguration, customInstructions, personality, autoApprovalSettings } = await this.stateManager.getState()
        return new Cline(
            provider,
            apiConfiguration,
            autoApprovalSettings || DEFAULT_AUTO_APPROVAL_SETTINGS,
            customInstructions,
            personality,
            task,
            images
        )
    }

    async initClineWithHistoryItem(
        provider: ClineProvider,
        historyItem: HistoryItem
    ): Promise<Cline> {
        console.log("[DEBUG] Initializing Cline with history item:", historyItem.id);
        const { apiConfiguration, customInstructions, personality, autoApprovalSettings } = await this.stateManager.getState()
        return new Cline(
            provider,
            apiConfiguration,
            autoApprovalSettings || DEFAULT_AUTO_APPROVAL_SETTINGS,
            customInstructions,
            personality,
            undefined,
            undefined,
            historyItem
        )
    }
}
