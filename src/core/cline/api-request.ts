import { UserContent } from "./types"
import { formatResponse } from "../prompts/responses"
import { formatContentBlockToMarkdown } from "../../integrations/misc/export-markdown"
import { findLastIndex } from "../../shared/array"
import { calculateApiCost } from "../../utils/cost"
import { serializeError } from "serialize-error"
import { Anthropic } from "@anthropic-ai/sdk"
import { ClineMessage, ClineApiReqInfo,ClineApiReqCancelReason } from "../../shared/ExtensionMessage"
import { parseAssistantMessage,AssistantMessageContent } from "../assistant-message"
import { addCustomInstructions, SYSTEM_PROMPT } from "../prompts/system"
import { truncateHalfConversation } from "../sliding-window"
import pWaitFor from "p-wait-for"
import { McpConnection } from "../../services/mcp/McpHub"

export async function* attemptApiRequest(this: any, previousApiReqIndex: number): any {
    const cwd = this.workspaceTracker?.getCwd() ?? process.cwd()
    	// Wait for MCP servers to be connected before generating system prompt
		await pWaitFor(() => this.providerRef.deref()?.mcpHub?.isConnecting !== true, { timeout: 10_000 }).catch(() => {
			console.error("MCP servers failed to connect in time")
		})
        const mcpHub = this.providerRef.deref()?.mcpHub
		if (!mcpHub) {
			throw new Error("MCP hub not available")
		}
		console.log(
			"mcpServers for system prompt:",
			JSON.stringify(
				mcpHub.connections.map((conn: McpConnection) => conn.server)

			),
		)
        let systemPrompt = await SYSTEM_PROMPT(cwd, this.api.getModel().info.supportsComputerUse ?? false, mcpHub, this.personality)
        if (this.customInstructions && this.customInstructions.trim()) {
        systemPrompt += addCustomInstructions(this.customInstructions)
    }
    console.log("[api-request] System prompt prepared");

    const stream = this.api.createMessage(systemPrompt, this.apiConversationHistory)
    const iterator = stream[Symbol.asyncIterator]()

    try {
        console.log("[api-request] Awaiting first chunk");
        const firstChunk = await iterator.next()
        yield firstChunk.value
    } catch (error) {
        console.log("[api-request] Error in first chunk:", error);
        console.log("[api-request] Error details:", {
            name: error.name,
            message: error.message,
            status: error.status,
            error: error.error
        });
        const { response } = await this.ask(
            "api_req_failed",
            error.message ?? JSON.stringify(serializeError(error), null, 2),
        )
        if (response !== "yesButtonClicked") {
            throw new Error("API request failed")
        }
        await this.say("api_req_retried")
        yield* this.attemptApiRequest(previousApiReqIndex)
        return
    }

    yield* iterator
}

export async function recursivelyMakeClineRequests(
    this: any,
    userContent: UserContent,
    includeFileDetails: boolean = false
): Promise<boolean> {
    console.log("[api-request] Starting recursivelyMakeClineRequests");
    console.log("[api-request] Initial userContent:", JSON.stringify(userContent, null, 2));
    
    if (this.abort) {
        throw new Error("Zaki instance aborted")
    }

    if (this.consecutiveMistakeCount >= 3) {
        const { response, text, images } = await this.ask(
            "mistake_limit_reached",
            this.api.getModel().id.includes("claude")
                ? `This may indicate a failure in his thought process or inability to use a tool properly, which can be mitigated with some user guidance (e.g. "Try breaking down the task into smaller steps").`
                : "Zaki uses complex prompts and iterative task execution that may be challenging for less capable models. For best results, it's recommended to use Claude 3.5 Sonnet for its advanced agentic coding capabilities.",
        )
        if (response === "messageResponse") {
            userContent.push(
                ...[
                    {
                        type: "text",
                        text: formatResponse.tooManyMistakes(text),
                    } as Anthropic.Messages.TextBlockParam,
                    ...formatResponse.imageBlocks(images),
                ],
            )
        }
        this.consecutiveMistakeCount = 0
    }

    // get previous api req's index to check token usage and determine if we need to truncate conversation history
    const previousApiReqIndex = findLastIndex(this.clineMessages, (m: ClineMessage) => m.say === "api_req_started")

    // getting verbose details is an expensive operation, it uses globby to top-down build file structure of project which for large projects can take a few seconds
    // getting verbose details is an expensive operation, it uses globby to top-down build file structure of project which for large projects can take a few seconds
    // for the best UX we show a placeholder api_req_started message with a loading spinner as this happens
    await this.say(
        "api_req_started",
        JSON.stringify({
            request:
                userContent.map((block) => formatContentBlockToMarkdown(block)).join("\n\n") + "\n\nLoading...",
        }),
    )

    console.log("[api-request] Loading context");
    const [parsedUserContent, environmentDetails] = await this.loadContext(userContent, includeFileDetails)
    console.log("[api-request] Context loaded");
    console.log("[api-request] Environment details:", environmentDetails);
    console.log("[api-request] Parsed user content:", JSON.stringify(parsedUserContent, null, 2));
    
    userContent = parsedUserContent

    // Ensure all content items are properly formatted Anthropic message blocks
    userContent = userContent.map(item => {
        if (typeof item === 'string') {
            return {
                type: "text",
                text: item
            } as Anthropic.Messages.TextBlockParam
        }
        return item
    })

    // Format environment details as a proper Anthropic message block
    const envBlock = {
        type: "text",
        text: environmentDetails
    } as Anthropic.Messages.TextBlockParam
    console.log("[api-request] Environment block:", JSON.stringify(envBlock, null, 2));
    
    // Add environment details as a properly formatted text block
    userContent.push(envBlock)

    console.log("[api-request] Final userContent before API:", JSON.stringify(userContent, null, 2));

    // Create the full message object
    const apiMessage = { 
        role: "user", 
        content: userContent 
    }
    console.log("[api-request] API message being sent:", JSON.stringify(apiMessage, null, 2));

    await this.addToApiConversationHistory(apiMessage)
    console.log("[api-request] Added to API conversation history");
    //console.log("[api-request] Current API conversation history:", JSON.stringify(this.apiConversationHistory, null, 2));

    // since we sent off a placeholder api_req_started message to update the webview while waiting to actually start the API request (to load potential details for example), we need to update the text of that message
    const lastApiReqIndex = findLastIndex(this.clineMessages, (m: ClineMessage) => m.say === "api_req_started")
    this.clineMessages[lastApiReqIndex].text = JSON.stringify({
        request: userContent.map((block) => formatContentBlockToMarkdown(block)).join("\n\n"),
    })
    await this.saveClineMessages()
    await this.providerRef.deref()?.postStateToWebview()
    
    try {
        let cacheWriteTokens = 0
        let cacheReadTokens = 0
        let inputTokens = 0
        let outputTokens = 0
        let totalCost: number | undefined

        const updateApiReqMsg = (cancelReason?: any, streamingFailedMessage?: string) => {
            this.clineMessages[lastApiReqIndex].text = JSON.stringify({
                ...JSON.parse(this.clineMessages[lastApiReqIndex].text || "{}"),
                tokensIn: inputTokens,
                tokensOut: outputTokens,
                cacheWrites: cacheWriteTokens,
                cacheReads: cacheReadTokens,
                cost:
                    totalCost ??
                    calculateApiCost(
                        this.api.getModel().info,
                        inputTokens,
                        outputTokens,
                        cacheWriteTokens,
                        cacheReadTokens,
                    ),
                cancelReason,
                streamingFailedMessage,
            } satisfies ClineApiReqInfo)
        }

        const abortStream = async (cancelReason: ClineApiReqCancelReason, streamingFailedMessage?: string) => {
            if (this.diffViewProvider.isEditing) {
                await this.diffViewProvider.revertChanges() // closes diff view
            }

            // if last message is a partial we need to update and save it
            const lastMessage = this.clineMessages.at(-1)
            if (lastMessage && lastMessage.partial) {
                // lastMessage.ts = Date.now() DO NOT update ts since it is used as a key for virtuoso list
                lastMessage.partial = false
                // instead of streaming partialMessage events, we do a save and post like normal to persist to disk
                console.log("updating partial message", lastMessage)
                // await this.saveClineMessages()
            }

            // Let assistant know their response was interrupted for when task is resumed
            await this.addToApiConversationHistory({
                role: "assistant",
                content: [
                    {
                        type: "text",
                        text:
                            assistantMessage +
                            `\n\n[${cancelReason === "streaming_failed"
                                ? "Response interrupted by API Error"
                                : "Response interrupted by user"
                            }]`,
                    },
                ],
            })

            // update api_req_started to have cancelled and cost, so that we can display the cost of the partial stream
            await this.saveClineMessages()

            // signals to provider that it can retrieve the saved messages from disk, as abortTask can not be awaited on in nature
            this.didFinishAborting = true
        }

        // reset streaming state
        this.currentStreamingContentIndex = 0
        this.assistantMessageContent = []
        this.didCompleteReadingStream = false
        this.userMessageContent = []
        this.userMessageContentReady = false
        this.didRejectTool = false
        this.didAlreadyUseTool = false
        this.presentAssistantMessageLocked = false
        this.presentAssistantMessageHasPendingUpdates = false
        await this.diffViewProvider.reset()

        console.log("[api-request] Starting API request stream");
        const stream = this.attemptApiRequest(previousApiReqIndex)
        let assistantMessage = ""
        try {
            for await (const chunk of stream) {
                switch (chunk.type) {
                    case "usage":
                        inputTokens += chunk.inputTokens
                        outputTokens += chunk.outputTokens
                        cacheWriteTokens += chunk.cacheWriteTokens ?? 0
                        cacheReadTokens += chunk.cacheReadTokens ?? 0
                        totalCost = chunk.totalCost
                        break
                    case "text":
                        assistantMessage += chunk.text
                        // parse raw assistant message into content blocks
                        const prevLength = this.assistantMessageContent.length
                        this.assistantMessageContent = parseAssistantMessage(assistantMessage)
                        if (this.assistantMessageContent.length > prevLength) {
                            this.userMessageContentReady = false
                        }
                        // present content to user
                        this.presentAssistantMessage()
                        break
                }

                if (this.abort) {
                    console.log("aborting stream...")
                    if (!this.abandoned) {
                        // only need to gracefully abort if this instance isn't abandoned (sometimes openrouter stream hangs, in which case this would affect future instances of cline)
                        await abortStream("user_cancelled")
                    }
                    break // aborts the stream
                }

                if (this.didRejectTool) {
                    // userContent has a tool rejection, so interrupt the assistant's response to present the user's feedback
                    assistantMessage += "\n\n[Response interrupted by user feedback]"
                    // this.userMessageContentReady = true // instead of setting this premptively, we allow the present iterator to finish and set userMessageContentReady when its ready
                    break
                }

                // PREV: we need to let the request finish for openrouter to get generation details
                // UPDATE: it's better UX to interrupt the request at the cost of the api cost not being retrieved
                if (this.didAlreadyUseTool) {
                    assistantMessage +=
                        "\n\n[Response interrupted by a tool use result. Only one tool may be used at a time and should be placed at the end of the message.]"
                    break
                }
            }
        } catch (error) {
            console.log("[api-request] Error in stream:", error);
            // abandoned happens when extension is no longer waiting for the cline instance to finish aborting (error is thrown here when any function in the for loop throws due to this.abort)
            if (!this.abandoned) {
                this.abortTask() // if the stream failed, there's various states the task could be in (i.e. could have streamed some tools the user may have executed), so we just resort to replicating a cancel task
                await abortStream(
                    "streaming_failed",
                    error.message ?? JSON.stringify(serializeError(error), null, 2),
                )
                const history = await this.providerRef.deref()?.getTaskWithId(this.taskId)
                if (history) {
                    await this.providerRef.deref()?.initClineWithHistoryItem(history.historyItem)
                    // await this.providerRef.deref()?.postStateToWebview()
                }
            }
        }

        // need to call here in case the stream was aborted
        if (this.abort) {
            throw new Error("Zaki instance aborted")
        }

        this.didCompleteReadingStream = true

        // set any blocks to be complete to allow presentAssistantMessage to finish and set userMessageContentReady to true
        // (could be a text block that had no subsequent tool uses, or a text block at the very end, or an invalid tool use, etc. whatever the case, presentAssistantMessage relies on these blocks either to be completed or the user to reject a block in order to proceed and eventually set userMessageContentReady to true)
        const partialBlocks = this.assistantMessageContent.filter((block:AssistantMessageContent) => block.partial)
        partialBlocks.forEach((block:AssistantMessageContent) => {
            block.partial = false
        })
        // this.assistantMessageContent.forEach((e) => (e.partial = false)) // cant just do this bc a tool could be in the middle of executing ()
        if (partialBlocks.length > 0) {
            this.presentAssistantMessage() // if there is content to update then it will complete and update this.userMessageContentReady to true, which we pwaitfor before making the next request. all this is really doing is presenting the last partial message that we just set to complete
        }

        updateApiReqMsg()
        await this.saveClineMessages()
        await this.providerRef.deref()?.postStateToWebview()

        // now add to apiconversationhistory
        // need to save assistant responses to file before proceeding to tool use since user can exit at any moment and we wouldn't be able to save the assistant's response
        let didEndLoop = false
        if (assistantMessage.length > 0) {
            await this.addToApiConversationHistory({
                role: "assistant",
                content: [{ type: "text", text: assistantMessage }],
            })

            // NOTE: this comment is here for future reference - this was a workaround for userMessageContent not getting set to true. It was due to it not recursively calling for partial blocks when didRejectTool, so it would get stuck waiting for a partial block to complete before it could continue.
            // in case the content blocks finished
            // it may be the api stream finished after the last parsed content block was executed, so  we are able to detect out of bounds and set userMessageContentReady to true (note you should not call presentAssistantMessage since if the last block is completed it will be presented again)
            // const completeBlocks = this.assistantMessageContent.filter((block) => !block.partial) // if there are any partial blocks after the stream ended we can consider them invalid
            // if (this.currentStreamingContentIndex >= completeBlocks.length) {
            // 	this.userMessageContentReady = true
            // }

            await pWaitFor(() => this.userMessageContentReady)

            // if the model did not tool use, then we need to tell it to either use a tool or attempt_completion
            const didToolUse = this.assistantMessageContent.some((block:AssistantMessageContent) => block.type === "tool_use")
            if (!didToolUse) {
                this.userMessageContent.push({
                    type: "text",
                    text: formatResponse.noToolsUsed(),
                })
                this.consecutiveMistakeCount++
            }

            const recDidEndLoop = await this.recursivelyMakeClineRequests(this.userMessageContent)
            didEndLoop = recDidEndLoop
        } else {
            // if there's no assistant_responses, that means we got no text or tool_use content blocks from API which we should assume is an error
            await this.say(
                "error",
                "Unexpected API Response: The language model did not provide any assistant messages. This may indicate an issue with the API or the model's output.",
            )
            await this.addToApiConversationHistory({
                role: "assistant",
                content: [{ type: "text", text: "Failure: I did not provide a response." }],
            })
        }

        return didEndLoop
    } catch (error) {
        console.log("[api-request] Error in request:", error);
        console.log("[api-request] Error details:", JSON.stringify(serializeError(error), null, 2));
        return true
    }
}
