import * as path from "path"
import * as fs from "fs/promises"
import * as vscode from "vscode"
import { Anthropic } from "@anthropic-ai/sdk"
import { ClineMessage } from "../../shared/ExtensionMessage"
import { GlobalFileNames } from "../webview/ClineProvider"
import { getApiMetrics } from "../../shared/getApiMetrics"
import { combineApiRequests } from "../../shared/combineApiRequests"
import { combineCommandSequences } from "../../shared/combineCommandSequences"
import { findLastIndex } from "../../shared/array"
import { readJsonFile, writeJsonFile, ensureJsonDirectory } from "../../utils/json-storage"

export async function ensureTaskDirectoryExists(this: any): Promise<string> {
    console.log("[DEBUG] Ensuring task directory exists")
    
    // Try to get workspace or opened folder path
    const workspaceRoot = this.providerRef.deref()?.context.workspaceState.workspaceFolder;
    const openedFolderPath = this.cwd;

    // Use workspace root or opened folder path
    const projectRoot = workspaceRoot || openedFolderPath
    
    if (projectRoot) {
        console.log(`[DEBUG] Using project root at: ${projectRoot}`)
        const taskDir = path.join(projectRoot, ".zaki", "tasks", this.taskId)
        await ensureJsonDirectory(taskDir)
        console.log(`[DEBUG] Created project-level task directory at: ${taskDir}`)
        return taskDir
    }

    // Fall back to global storage if no workspace or folder is open
    console.log("[DEBUG] No project root found, falling back to global storage")
    const globalStoragePath = this.providerRef.deref()?.context.globalStorageUri.fsPath
    if (!globalStoragePath) {
        throw new Error("Global storage uri is invalid")
    }
    const taskDir = path.join(globalStoragePath, "tasks", this.taskId)
    await ensureJsonDirectory(taskDir)
    console.log(`[DEBUG] Created global task directory at: ${taskDir}`)
    return taskDir
}

export async function getSavedApiConversationHistory(this: any): Promise<Anthropic.Messages.MessageParam[]> {
    console.log("[DEBUG] Getting saved API conversation history")
    const filePath = path.join(await this.ensureTaskDirectoryExists(), GlobalFileNames.apiConversationHistory)
    
    const history = await readJsonFile<Anthropic.Messages.MessageParam[]>(filePath, {
        warningMessage: "API conversation history file is corrupted. History will be reset to prevent initialization issues.",
        defaultValue: [],
        createBackup: true,
        resetOnError: true
    })

    return history || []
}

export async function addToApiConversationHistory(this: any, message: Anthropic.Messages.MessageParam) {
    console.log("[DEBUG] Adding message to API conversation history")
    this.apiConversationHistory.push(message)
    await this.saveApiConversationHistory()
}

export async function overwriteApiConversationHistory(this: any, newHistory: Anthropic.Messages.MessageParam[]) {
    console.log("[DEBUG] Overwriting API conversation history")
    this.apiConversationHistory = newHistory
    await this.saveApiConversationHistory(this)
}

export async function saveApiConversationHistory(this: any) {
    try {
        console.log("[DEBUG] Saving API conversation history")
        const filePath = path.join(await this.ensureTaskDirectoryExists(this), GlobalFileNames.apiConversationHistory)
        await writeJsonFile(filePath, this.apiConversationHistory)
        console.log(`[DEBUG] Successfully saved API conversation history to: ${filePath}`)
    } catch (error) {
        console.error("[DEBUG] Failed to save API conversation history:", error)
        throw error
    }
}

export async function getSavedClineMessages(this: any): Promise<ClineMessage[]> {
    console.log("[DEBUG] Getting saved Cline messages")
    const filePath = path.join(await this.ensureTaskDirectoryExists(this), GlobalFileNames.uiMessages)
    
    // Try reading from current location
    const messages = await readJsonFile<ClineMessage[]>(filePath, {
        warningMessage: "Cline messages file is corrupted. Messages will be reset to prevent initialization issues.",
        defaultValue: [],
        createBackup: true,
        resetOnError: true
    })
    
    if (messages) {
        return messages
    }

    

    console.log("[DEBUG] No existing Cline messages found")
    return []
}

export async function addToClineMessages(this: any, message: ClineMessage) {
    console.log("[DEBUG] Adding new Cline message")
    this.clineMessages.push(message)
    await this.saveClineMessages()
}

export async function overwriteClineMessages(this: any, newMessages: ClineMessage[]) {
    console.log("[DEBUG] Overwriting Cline messages")
    this.clineMessages = newMessages
    await this.saveClineMessages()
}

export async function saveClineMessages(this: any) {
    try {
        console.log("[DEBUG] Saving Cline messages")
        const filePath = path.join(await this.ensureTaskDirectoryExists(this), GlobalFileNames.uiMessages)
        await writeJsonFile(filePath, this.clineMessages, true)
        
        const apiMetrics = getApiMetrics(combineApiRequests(combineCommandSequences(this.clineMessages.slice(1))))
        const taskMessage = this.clineMessages[0] // first message is always the task say
        const lastRelevantMessage =
            this.clineMessages[
                findLastIndex(
                    this.clineMessages,
                    (m: ClineMessage) => !(m.ask === "resume_task" || m.ask === "resume_completed_task"),
                )
            ]
        
        await this.providerRef.deref()?.updateTaskHistory({
            id: this.taskId,
            ts: lastRelevantMessage.ts,
            task: taskMessage.text ?? "",
            tokensIn: apiMetrics.totalTokensIn,
            tokensOut: apiMetrics.totalTokensOut,
            cacheWrites: apiMetrics.totalCacheWrites,
            cacheReads: apiMetrics.totalCacheReads,
            totalCost: apiMetrics.totalCost,
        })
        console.log(`[DEBUG] Successfully saved Cline messages to: ${filePath}`)
    } catch (error) {
        console.error("[DEBUG] Failed to save Cline messages:", error)
        throw error
    }
}
