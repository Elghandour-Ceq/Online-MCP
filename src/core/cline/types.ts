import { Anthropic } from "@anthropic-ai/sdk"
import { ApiHandler } from "../../api"
import { ClineProvider } from "../webview/ClineProvider"
import { ApiConfiguration } from "../../shared/api"
import { HistoryItem } from "../../shared/HistoryItem"
import { ClineMessage } from "../../shared/ExtensionMessage"
import { AssistantMessageContent } from "../assistant-message"
import { ClineAskResponse } from "../../shared/WebviewMessage"
import { DiffViewProvider } from "../../integrations/editor/DiffViewProvider"
import { TerminalManager } from "../../integrations/terminal/TerminalManager"
import { UrlContentFetcher } from "../../services/browser/UrlContentFetcher"
import { BrowserSession } from "../../services/browser/BrowserSession"

export type UserContent = Array<
    Anthropic.TextBlockParam | 
    Anthropic.ImageBlockParam | 
    Anthropic.ToolUseBlockParam | 
    Anthropic.ToolResultBlockParam
>

export type ToolResponse = string | Array<Anthropic.TextBlockParam | Anthropic.ImageBlockParam>

export interface ClineConstructorParams {
    provider: ClineProvider
    apiConfiguration: ApiConfiguration
    customInstructions?: string
    personality?: string
    alwaysAllowReadOnly?: boolean
    task?: string
    images?: string[]
    historyItem?: HistoryItem
}

export interface ClineState {
    taskId: string
    api: ApiHandler
    terminalManager: TerminalManager
    urlContentFetcher: UrlContentFetcher
    browserSession: BrowserSession
    didEditFile: boolean
    customInstructions?: string
    personality?: string
    alwaysAllowReadOnly: boolean
    apiConversationHistory: Anthropic.MessageParam[]
    clineMessages: ClineMessage[]
    askResponse?: ClineAskResponse
    askResponseText?: string
    askResponseImages?: string[]
    lastMessageTs?: number
    consecutiveMistakeCount: number
    providerRef: WeakRef<ClineProvider>
    abort: boolean
    didFinishAborting: boolean
    abandoned: boolean
    diffViewProvider: DiffViewProvider

    // Streaming state
    currentStreamingContentIndex: number
    assistantMessageContent: AssistantMessageContent[]
    presentAssistantMessageLocked: boolean
    presentAssistantMessageHasPendingUpdates: boolean
    userMessageContent: (Anthropic.TextBlockParam | Anthropic.ImageBlockParam)[]
    userMessageContentReady: boolean
    didRejectTool: boolean
    didAlreadyUseTool: boolean
    didCompleteReadingStream: boolean
}
