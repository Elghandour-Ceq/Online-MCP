import { Anthropic } from "@anthropic-ai/sdk"
import { UserContent } from "./types"
import { formatResponse } from "../prompts/responses"
import { findLastIndex } from "../../shared/array"
import {
	BrowserAction,
	BrowserActionResult,
	browserActions,
	ClineApiReqCancelReason,
	ClineApiReqInfo,
	ClineAsk,
    ClineAskUseMcpServer,
	ClineMessage,
	ClineSay,
	ClineSayBrowserAction,
	ClineSayTool,
} from "../../shared/ExtensionMessage"
import { findToolName, formatContentBlockToMarkdown } from "../../integrations/misc/export-markdown"

export async function startTask(this: any, task?: string, images?: string[]): Promise<void> {
    console.log("[DEBUG] startTask - Starting new task")
    console.log("[DEBUG] Task text:", task)
    console.log("[DEBUG] Number of images:", images?.length || 0)
    
    this.clineMessages = []
    this.apiConversationHistory = []
    await this.providerRef.deref()?.postStateToWebview()

    console.log("[DEBUG] Sending initial task message")
    await this.say("text", task, images)

    console.log("[DEBUG] Creating image blocks")
    let imageBlocks: any[] = formatResponse.imageBlocks(images)
    console.log("[DEBUG] Created image blocks:", imageBlocks.length)
    console.log("[DEBUG] Image block details:", imageBlocks.map(block => ({
        type: block.type,
        source: {
            type: block.source.type,
            media_type: block.source.media_type,
            dataLength: block.source.data?.length || 0
        }
    })))

    const initialContent = [
        {
            type: "text",
            text: `<task>\n${task}\n</task>`,
        },
        ...imageBlocks,
    ]
    console.log("[DEBUG] Initial content structure:", initialContent.map(block => {
        if (block.type === "text") {
            return {
                type: block.type,
                contentLength: block.text?.length
            }
        } else if (block.type === "image") {
            return {
                type: block.type,
                contentLength: block.source?.data?.length
            }
        }
        return { type: block.type }
    }))

    await this.initiateTaskLoop(initialContent)
}

export async function resumeTaskFromHistory(this: any) {
    console.log("[DEBUG] resumeTaskFromHistory - Starting task resumption")
    
    const modifiedClineMessages = await this.getSavedClineMessages(this)

    // Remove any resume messages that may have been added before
    const lastRelevantMessageIndex = findLastIndex(
        modifiedClineMessages,
        (m: any) => !(m.ask === "resume_task" || m.ask === "resume_completed_task"),
    )
    if (lastRelevantMessageIndex !== -1) {
        modifiedClineMessages.splice(lastRelevantMessageIndex + 1)
    }

    // since we don't use api_req_finished anymore, we need to check if the last api_req_started has a cost value, if it doesn't and no cancellation reason to present, then we remove it since it indicates an api request without any partial content streamed
    const lastApiReqStartedIndex = findLastIndex(
        modifiedClineMessages,
        (m: ClineMessage) => m.type === "say" && m.say === "api_req_started",
    )
    if (lastApiReqStartedIndex !== -1) {
        const lastApiReqStarted = modifiedClineMessages[lastApiReqStartedIndex]
        const { cost, cancelReason }: ClineApiReqInfo = JSON.parse(lastApiReqStarted.text || "{}")
        if (cost === undefined && cancelReason === undefined) {
            modifiedClineMessages.splice(lastApiReqStartedIndex, 1)
        }
    }

    await this.overwriteClineMessages(modifiedClineMessages)
    this.clineMessages = await this.getSavedClineMessages()

    const lastClineMessage = this.clineMessages
        .slice()
        .reverse()
        .find((m:ClineMessage) => !(m.ask === "resume_task" || m.ask === "resume_completed_task"))

    let askType: ClineAsk
    if (lastClineMessage?.ask === "completion_result") {
        askType = "resume_completed_task"
    } else {
        askType = "resume_task"
    }

    const { response, text, images } = await this.ask(askType)
    let responseText: string | undefined
    let responseImages: string[] | undefined
    if (response === "messageResponse") {
        await this.say("user_feedback", text, images)
        responseText = text
        responseImages = images
    }

    let existingApiConversationHistory: Anthropic.Messages.MessageParam[] =
        await this.getSavedApiConversationHistory()

    const conversationWithoutToolBlocks = existingApiConversationHistory.map((message) => {
        if (Array.isArray(message.content)) {
            const newContent = message.content.map((block) => {
                if (block.type === "tool_use") {
                    const inputAsXml = Object.entries(block.input as Record<string, string>)
                        .map(([key, value]) => `<${key}>\n${value}\n</${key}>`)
                        .join("\n")
                    return {
                        type: "text",
                        text: `<${block.name}>\n${inputAsXml}\n</${block.name}>`,
                    } as Anthropic.Messages.TextBlockParam
                } else if (block.type === "tool_result") {
                    const contentAsTextBlocks = Array.isArray(block.content)
                        ? block.content.filter((item) => item.type === "text")
                        : [{ type: "text", text: block.content }]
                    const textContent = contentAsTextBlocks.map((item) => item.text).join("\n\n")
                    const toolName = findToolName(block.tool_use_id, existingApiConversationHistory)
                    return {
                        type: "text",
                        text: `[${toolName} Result]\n\n${textContent}`,
                    } as Anthropic.Messages.TextBlockParam
                }
                return block
            })
            return { ...message, content: newContent }
        }
        return message
    })
    existingApiConversationHistory = conversationWithoutToolBlocks

    let modifiedOldUserContent: UserContent
    let modifiedApiConversationHistory: Anthropic.Messages.MessageParam[]
    if (existingApiConversationHistory.length > 0) {
        const lastMessage = existingApiConversationHistory[existingApiConversationHistory.length - 1]

        if (lastMessage.role === "assistant") {
            const content = Array.isArray(lastMessage.content)
                ? lastMessage.content
                : [{ type: "text", text: lastMessage.content }]
            const hasToolUse = content.some((block) => block.type === "tool_use")

            if (hasToolUse) {
                const toolUseBlocks = content.filter(
                    (block) => block.type === "tool_use",
                ) as Anthropic.Messages.ToolUseBlock[]
                const toolResponses: Anthropic.ToolResultBlockParam[] = toolUseBlocks.map((block) => ({
                    type: "tool_result",
                    tool_use_id: block.id,
                    content: "Task was interrupted before this tool call could be completed.",
                }))
                modifiedApiConversationHistory = [...existingApiConversationHistory]
                modifiedOldUserContent = [...toolResponses]
            } else {
                modifiedApiConversationHistory = [...existingApiConversationHistory]
                modifiedOldUserContent = []
            }
        } else if (lastMessage.role === "user") {
            const previousAssistantMessage: Anthropic.Messages.MessageParam | undefined =
                existingApiConversationHistory[existingApiConversationHistory.length - 2]

            const existingUserContent: UserContent = Array.isArray(lastMessage.content)
                ? lastMessage.content
                : [{ type: "text", text: lastMessage.content }]
            if (previousAssistantMessage && previousAssistantMessage.role === "assistant") {
                const assistantContent = Array.isArray(previousAssistantMessage.content)
                    ? previousAssistantMessage.content
                    : [{ type: "text", text: previousAssistantMessage.content }]

                const toolUseBlocks = assistantContent.filter(
                    (block) => block.type === "tool_use",
                ) as Anthropic.Messages.ToolUseBlock[]

                if (toolUseBlocks.length > 0) {
                    const existingToolResults = existingUserContent.filter(
                        (block) => block.type === "tool_result",
                    ) as Anthropic.ToolResultBlockParam[]

                    const missingToolResponses: Anthropic.ToolResultBlockParam[] = toolUseBlocks
                        .filter(
                            (toolUse) => !existingToolResults.some((result) => result.tool_use_id === toolUse.id),
                        )
                        .map((toolUse) => ({
                            type: "tool_result",
                            tool_use_id: toolUse.id,
                            content: "Task was interrupted before this tool call could be completed.",
                        }))

                    modifiedApiConversationHistory = existingApiConversationHistory.slice(0, -1)
                    modifiedOldUserContent = [...existingUserContent, ...missingToolResponses]
                } else {
                    modifiedApiConversationHistory = existingApiConversationHistory.slice(0, -1)
                    modifiedOldUserContent = [...existingUserContent]
                }
            } else {
                modifiedApiConversationHistory = existingApiConversationHistory.slice(0, -1)
                modifiedOldUserContent = [...existingUserContent]
            }
        } else {
            throw new Error("Unexpected: Last message is not a user or assistant message")
        }
    } else {
        throw new Error("Unexpected: No existing API conversation history")
    }

    let newUserContent: UserContent = [...modifiedOldUserContent]

    const agoText = (() => {
        const timestamp = lastClineMessage?.ts ?? Date.now()
        const now = Date.now()
        const diff = now - timestamp
        const minutes = Math.floor(diff / 60000)
        const hours = Math.floor(minutes / 60)
        const days = Math.floor(hours / 24)

        if (days > 0) {
            return `${days} day${days > 1 ? "s" : ""} ago`
        }
        if (hours > 0) {
            return `${hours} hour${hours > 1 ? "s" : ""} ago`
        }
        if (minutes > 0) {
            return `${minutes} minute${minutes > 1 ? "s" : ""} ago`
        }
        return "just now"
    })()

    const wasRecent = lastClineMessage?.ts && Date.now() - lastClineMessage.ts < 30_000

    newUserContent.push({
        type: "text",
        text:
            `[TASK RESUMPTION] This task was interrupted ${agoText}. It may or may not be complete, so please reassess the task context. Be aware that the project state may have changed since then. The current working directory is now '${this.cwd.toPosix()}'. If the task has not been completed, retry the last step before interruption and proceed with completing the task.\n\nNote: If you previously attempted a tool use that the user did not provide a result for, you should assume the tool use was not successful and assess whether you should retry. If the last tool was a browser_action, the browser has been closed and you must launch a new browser if needed.${
                wasRecent
                    ?  "\n\nIMPORTANT: If the last tool use was a replace_in_file or write_to_file that was interrupted, the file was reverted back to its original state before the interrupted edit, and you do NOT need to re-read the file as you already have its up-to-date contents."
                    : ""
            }` +
            (responseText
                ? `\n\nNew instructions for task continuation:\n<user_message>\n${responseText}\n</user_message>`
                : ""),
    })

    if (responseImages && responseImages.length > 0) {
        console.log("[DEBUG] Adding response images to user content")
        const imageBlocks = formatResponse.imageBlocks(responseImages)
        console.log("[DEBUG] Created image blocks:", imageBlocks.length)
        newUserContent.push(...imageBlocks)
    }

    await this.overwriteApiConversationHistory(modifiedApiConversationHistory)
    await this.initiateTaskLoop(newUserContent)
}

export async function initiateTaskLoop(this: any, userContent: UserContent): Promise<void> {
    console.log("[DEBUG] initiateTaskLoop - Starting task loop")
    console.log("[DEBUG] Initial user content:", userContent.map(block => {
        if (block.type === "text") {
            return {
                type: block.type,
                contentLength: block.text?.length
            }
        } else if (block.type === "image") {
            return {
                type: block.type,
                contentLength: block.source?.data?.length
            }
        }
        return { type: block.type }
    }))
    
    let nextUserContent = userContent
    let includeFileDetails = true
    while (!this.abort) {
        const didEndLoop = await this.recursivelyMakeClineRequests(nextUserContent, includeFileDetails)
        includeFileDetails = false // we only need file details the first time

        if (didEndLoop) {
            break
        } else {
            nextUserContent = [
                {
                    type: "text",
                    text: formatResponse.noToolsUsed(),
                },
            ]
            this.consecutiveMistakeCount++
        }
    }
}
