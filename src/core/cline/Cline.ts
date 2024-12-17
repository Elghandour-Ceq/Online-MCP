import { Anthropic } from "@anthropic-ai/sdk"
import cloneDeep from "clone-deep"
import delay from "delay"
import fs from "fs/promises"
import os from "os"
import pWaitFor from "p-wait-for"
import * as path from "path"
import { serializeError } from "serialize-error"
import * as vscode from "vscode"

import { ApiHandler, buildApiHandler } from "../../api"
import { ApiStream } from "../../api/transform/stream"
import { DiffViewProvider } from "../../integrations/editor/DiffViewProvider"
import { findToolName, formatContentBlockToMarkdown } from "../../integrations/misc/export-markdown"
import { extractTextFromFile } from "../../integrations/misc/extract-text"
import { TerminalManager } from "../../integrations/terminal/TerminalManager"
import { UrlContentFetcher } from "../../services/browser/UrlContentFetcher"
import { listFiles } from "../../services/glob/list-files"
import { regexSearchFiles } from "../../services/ripgrep"
import { parseSourceCodeForDefinitionsTopLevel } from "../../services/tree-sitter"
import { ApiConfiguration } from "../../shared/api"
import { findLastIndex } from "../../shared/array"
import { combineApiRequests } from "../../shared/combineApiRequests"
import { combineCommandSequences } from "../../shared/combineCommandSequences"
import {
    BrowserAction,
    BrowserActionResult,
    browserActions,
    ClineApiReqCancelReason,
    ClineApiReqInfo,
    ClineAsk,
    ClineMessage,
    ClineSay,
    ClineSayBrowserAction,
    ClineSayTool,
} from "../../shared/ExtensionMessage"
import { getApiMetrics } from "../../shared/getApiMetrics"
import { HistoryItem } from "../../shared/HistoryItem"
import { ClineAskResponse } from "../../shared/WebviewMessage"
import { calculateApiCost } from "../../utils/cost"
import { fileExistsAtPath } from "../../utils/fs"
import { arePathsEqual, getReadablePath } from "../../utils/path"
import { parseMentions } from "../mentions"
import { AssistantMessageContent, parseAssistantMessage, ToolParamName, ToolUseName } from "../assistant-message"
import { formatResponse } from "../prompts/responses"
import { truncateHalfConversation } from "../sliding-window"
import { ClineProvider, GlobalFileNames } from "../webview/ClineProvider"
import { showOmissionWarning } from "../../integrations/editor/detect-omission"
import { BrowserSession } from "../../services/browser/BrowserSession"

import { 
    UserContent, 
    ToolResponse, 
    ClineConstructorParams, 
    ClineState 
} from "./types"

import * as TaskLifecycle from "./task-lifecycle"
import * as ApiRequest from "./api-request"
import * as ToolExecution from "./tool-execution"
import * as Messaging from "./messaging"
import * as ContextLoading from "./context-loading"
import * as ConversationStore from "./conversations-store"

// Import tools
import { write_to_file } from "./tools/write_to_file"
import { read_file } from "./tools/read_file"
import { list_files } from "./tools/list_files"
import { list_code_definition_names } from "./tools/list_code_definition_names"
import { search_files } from "./tools/search_files"
import { browser_action } from "./tools/browser_action"
import { execute_command } from "./tools/execute_command"
import { ask_followup_question } from "./tools/ask_followup_question"
import { attempt_completion } from "./tools/attempt_completion"

export class Cline {
    public cwd = vscode.workspace.workspaceFolders?.map((folder) => folder.uri.fsPath).at(0) ?? path.join(os.homedir(), "Desktop")
    readonly taskId: string
    api: ApiHandler
    private terminalManager: TerminalManager
    private urlContentFetcher: UrlContentFetcher
    private browserSession: BrowserSession
    private didEditFile: boolean = false
    customInstructions?: string
    personality?: string
    alwaysAllowReadOnly: boolean
    apiConversationHistory: Anthropic.MessageParam[] = []
    clineMessages: ClineMessage[] = []
    private askResponse?: ClineAskResponse
    private askResponseText?: string
    private askResponseImages?: string[]
    private lastMessageTs?: number
    private consecutiveMistakeCount: number = 0
    providerRef: WeakRef<ClineProvider>
    private abort: boolean = false
    didFinishAborting = false
    abandoned = false
    private diffViewProvider: DiffViewProvider

    // streaming
    private currentStreamingContentIndex = 0
    private assistantMessageContent: AssistantMessageContent[] = []
    private presentAssistantMessageLocked = false
    private presentAssistantMessageHasPendingUpdates = false
    private userMessageContent: (Anthropic.TextBlockParam | Anthropic.ImageBlockParam)[] = []
    private userMessageContentReady = false
    private didRejectTool = false
    private didAlreadyUseTool = false
    private didCompleteReadingStream = false

    constructor(
        provider: ClineProvider,
        apiConfiguration: ApiConfiguration,
        customInstructions?: string,
        personality?: string,
        alwaysAllowReadOnly?: boolean,
        task?: string,
        images?: string[],
        historyItem?: HistoryItem,
    ) {
        this.providerRef = new WeakRef(provider)
        this.api = buildApiHandler(apiConfiguration)
        this.terminalManager = new TerminalManager()
        this.urlContentFetcher = new UrlContentFetcher(provider.context)
        this.browserSession = new BrowserSession(provider.context)
        this.diffViewProvider = new DiffViewProvider(this.cwd)
        this.customInstructions = customInstructions
        this.personality = personality
        this.alwaysAllowReadOnly = alwaysAllowReadOnly ?? false

        if (historyItem) {
            this.taskId = historyItem.id
            this.resumeTaskFromHistory()
        } else if (task || images) {
            this.taskId = Date.now().toString()
            this.startTask(task, images)
        } else {
            throw new Error("Either historyItem or task/images must be provided")
        }
    }

    // Bind methods from separate files
    startTask = TaskLifecycle.startTask.bind(this)
    resumeTaskFromHistory = TaskLifecycle.resumeTaskFromHistory.bind(this)
    initiateTaskLoop = TaskLifecycle.initiateTaskLoop.bind(this)
    recursivelyMakeClineRequests = ApiRequest.recursivelyMakeClineRequests.bind(this)
    attemptApiRequest = ApiRequest.attemptApiRequest.bind(this)
    executeCommandTool = ToolExecution.executeCommandTool.bind(this)
    ask = Messaging.ask.bind(this)
    say = Messaging.say.bind(this)
    handleWebviewAskResponse = Messaging.handleWebviewAskResponse.bind(this)
    loadContext = ContextLoading.loadContext.bind(this)
    getEnvironmentDetails = ContextLoading.getEnvironmentDetails.bind(this)

    // Bind state management methods
    ensureTaskDirectoryExists = ConversationStore.ensureTaskDirectoryExists.bind(this)
    getSavedApiConversationHistory = ConversationStore.getSavedApiConversationHistory.bind(this)
    addToApiConversationHistory = ConversationStore.addToApiConversationHistory.bind(this)
    overwriteApiConversationHistory = ConversationStore.overwriteApiConversationHistory.bind(this)
    saveApiConversationHistory = ConversationStore.saveApiConversationHistory.bind(this)
    getSavedClineMessages = ConversationStore.getSavedClineMessages.bind(this)
    addToClineMessages = ConversationStore.addToClineMessages.bind(this)
    overwriteClineMessages = ConversationStore.overwriteClineMessages.bind(this)
    saveClineMessages = ConversationStore.saveClineMessages.bind(this)

    abortTask() {
        this.abort = true
        this.terminalManager.disposeAll()
        this.urlContentFetcher.closeBrowser()
        this.browserSession.closeBrowser()
    }

    async presentAssistantMessage() {
        if (this.abort) {
            throw new Error("Zaki instance aborted")
        }

        if (this.presentAssistantMessageLocked) {
            this.presentAssistantMessageHasPendingUpdates = true
            return
        }
        this.presentAssistantMessageLocked = true
        this.presentAssistantMessageHasPendingUpdates = false

        if (this.currentStreamingContentIndex >= this.assistantMessageContent.length) {
			// this may happen if the last content block was completed before streaming could finish. if streaming is finished, and we're out of bounds then this means we already presented/executed the last content block and are ready to continue to next request
            if (this.didCompleteReadingStream) {
                this.userMessageContentReady = true
            }
			// console.log("no more content blocks to stream! this shouldn't happen?")
            this.presentAssistantMessageLocked = false
            return
			//throw new Error("No more content blocks to stream! This shouldn't happen...") // remove and just return after testing
        }

        const block = cloneDeep(this.assistantMessageContent[this.currentStreamingContentIndex])
        switch (block.type) {
            case "text": {
                if (this.didRejectTool || this.didAlreadyUseTool) {
                    break
                }
                let content = block.content
                if (content) {
					// (have to do this for partial and complete since sending content in thinking tags to markdown renderer will automatically be removed)
					// Remove end substrings of <thinking or </thinking (below xml parsing is only for opening tags)
					// (this is done with the xml parsing below now, but keeping here for reference)
					// content = content.replace(/<\/?t(?:h(?:i(?:n(?:k(?:i(?:n(?:g)?)?)?)?)?)?)?$/, "")
					// Remove all instances of <thinking> (with optional line break after) and </thinking> (with optional line break before)
					// - Needs to be separate since we dont want to remove the line break before the first tag
					// - Needs to happen before the xml parsing below
                    content = content.replace(/<thinking>\s?/g, "")
                    content = content.replace(/\s?<\/thinking>/g, "")

                    const lastOpenBracketIndex = content.lastIndexOf("<")
                    if (lastOpenBracketIndex !== -1) {
                        const possibleTag = content.slice(lastOpenBracketIndex)
                        const hasCloseBracket = possibleTag.includes(">")
                        if (!hasCloseBracket) {
                            let tagContent: string
                            if (possibleTag.startsWith("</")) {
                                tagContent = possibleTag.slice(2).trim()
                            } else {
                                tagContent = possibleTag.slice(1).trim()
                            }
                            const isLikelyTagName = /^[a-zA-Z_]+$/.test(tagContent)
                            const isOpeningOrClosing = possibleTag === "<" || possibleTag === "</"
                            if (isOpeningOrClosing || isLikelyTagName) {
                                content = content.slice(0, lastOpenBracketIndex).trim()
                            }
                        }
                    }
                }
                await this.say("text", content, undefined, block.partial)
                break
            }
            case "tool_use": 
                const toolDescription = () => {
                    switch (block.name) {
                        case "execute_command":
                            return `[${block.name} for '${block.params.command}']`
                        case "read_file":
                            return `[${block.name} for '${block.params.path}']`
                        case "write_to_file":
                            return `[${block.name} for '${block.params.path}']`
                        case "search_files":
                            return `[${block.name} for '${block.params.regex}'${
                                block.params.file_pattern ? ` in '${block.params.file_pattern}'` : ""
                            }]`
                        case "list_files":
                            return `[${block.name} for '${block.params.path}']`
                        case "list_code_definition_names":
                            return `[${block.name} for '${block.params.path}']`
                        case "browser_action":
                            return `[${block.name} for '${block.params.action}']`
                        case "ask_followup_question":
                            return `[${block.name} for '${block.params.question}']`
                        case "attempt_completion":
                            return `[${block.name}]`
                    }
                }

                if (this.didRejectTool) {
                    if (!block.partial) {
                        this.userMessageContent.push({
                            type: "text",
                            text: `Skipping tool ${toolDescription()} due to user rejecting a previous tool.`,
                        })
                    } else {
                        this.userMessageContent.push({
                            type: "text",
                            text: `Tool ${toolDescription()} was interrupted and not executed due to user rejecting a previous tool.`,
                        })
                    }
                    break
                }

                if (this.didAlreadyUseTool) {
                    this.userMessageContent.push({
                        type: "text",
                        text: `Tool [${block.name}] was not executed because a tool has already been used in this message. Only one tool may be used per message. You must assess the first tool's result before proceeding to use the next tool.`,
                    })
                    break
                }

                const pushToolResult = (content: ToolResponse) => {
                    this.userMessageContent.push({
                        type: "text",
                        text: `${toolDescription()} Result:`,
                    })
                    if (typeof content === "string") {
                        this.userMessageContent.push({
                            type: "text",
                            text: content || "(tool did not return anything)",
                        })
                    } else {
                        this.userMessageContent.push(...content)
                    }
                    this.didAlreadyUseTool = true
                }

                if (block.name !== "browser_action") {
                    await this.browserSession.closeBrowser()
                }

                let result: ToolResponse | undefined
                switch (block.name) {
                    case "write_to_file":
                        result = await write_to_file.call(this, block)
                        break
                    case "read_file":
                        result = await read_file.call(this, block)
                        break
                    case "list_files":
                        result = await list_files.call(this, block)
                        break
                    case "list_code_definition_names":
                        result = await list_code_definition_names.call(this, block)
                        break
                    case "search_files":
                        result = await search_files.call(this, block)
                        break
                    case "browser_action":
                        result = await browser_action.call(this, block)
                        break
                    case "execute_command":
                        result = await execute_command.call(this, block)
                        break
                    case "ask_followup_question":
                        result = await ask_followup_question.call(this, block)
                        break
                    case "attempt_completion":
                        result = await attempt_completion.call(this, block)
                        break
                }

                if (result) {
                    pushToolResult(result)
                }
                break
            
        }

        this.presentAssistantMessageLocked = false

        if (!block.partial || this.didRejectTool || this.didAlreadyUseTool) {
			// block is finished streaming and executing
            if (this.currentStreamingContentIndex === this.assistantMessageContent.length - 1) {
				// its okay that we increment if !didCompleteReadingStream, it'll just return bc out of bounds and as streaming continues it will call presentAssitantMessage if a new block is ready. if streaming is finished then we set userMessageContentReady to true when out of bounds. This gracefully allows the stream to continue on and all potential content blocks be presented.
				// last block is complete and it is finished executing
				this.userMessageContentReady = true // will allow pwaitfor to continue
            }

			// call next block if it exists (if not then read stream will call it when its ready)
			this.currentStreamingContentIndex++ // need to increment regardless, so when read stream calls this function again it will be streaming the next block

            if (this.currentStreamingContentIndex < this.assistantMessageContent.length) {
				// there are already more content blocks to stream, so we'll call this function ourselves
				// await this.presentAssistantContent()

                this.presentAssistantMessage()
                return
            }
        }

        if (this.presentAssistantMessageHasPendingUpdates) {
            this.presentAssistantMessage()
        }
    }

    async sayAndCreateMissingParamError(toolName: ToolUseName, paramName: string, relPath?: string) {
        await this.say(
            "error",
            `Zaki tried to use ${toolName}${
                relPath ? ` for '${relPath}'` : ""
            } without value for required parameter '${paramName}'. Retrying...`,
        )
        return formatResponse.toolError(formatResponse.missingToolParameterError(paramName))
    }
}
