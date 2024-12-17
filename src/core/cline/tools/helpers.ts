import { formatResponse } from "../../prompts/responses"
import { ToolParamName, ToolUse } from "../../assistant-message"
import { serializeError } from "serialize-error"
import { Anthropic } from "@anthropic-ai/sdk"
import { ClineAsk } from "../../../shared/ExtensionMessage"

export type ToolResponse = string | Array<Anthropic.TextBlockParam | Anthropic.ImageBlockParam>

export const removeClosingTag = (tag: ToolParamName, text?: string) => {
    if (!text) {
        return ""
    }
    const tagRegex = new RegExp(
        `\\s?<\/?${tag
            .split("")
            .map((char) => `(?:${char})?`)
            .join("")}$`,
        "g",
    )
    return text.replace(tagRegex, "")
}

export const pushToolResult = function (this: any, content: ToolResponse, block: ToolUse) {
    this.userMessageContent.push({
        type: "text",
        text: `${toolDescription(block)} Result:`,
    })
    if (typeof content === "string") {
        this.userMessageContent.push({
            type: "text",
            text: content || "(tool did not return anything)",
        })
    } else {
        this.userMessageContent.push(...content)
    }
    // once a tool result has been collected, ignore all other tool uses since we should only ever present one tool result per message
    this.didAlreadyUseTool = true
}

export const toolDescription = function (block: ToolUse) {
    switch (block.name) {
        case "execute_command":
            return `[${block.name} for '${block.params.command}']`
        case "read_file":
            return `[${block.name} for '${block.params.path}']`
        case "write_to_file":
            return `[${block.name} for '${block.params.path}']`
        case "search_files":
            return `[${block.name} for '${block.params.regex}'${block.params.file_pattern ? ` in '${block.params.file_pattern}'` : ""
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

export const askApproval = async function (this: any, block: ToolUse, type: ClineAsk, partialMessage?: string) {
    const { response, text, images } = await this.ask(type, partialMessage, false)
    if (response !== "yesButtonClicked") {
        if (response === "messageResponse") {
            await this.say("user_feedback", text, images)
            pushToolResult.call(
                this,
                formatResponse.toolResult(formatResponse.toolDeniedWithFeedback(text), images),
                block
            )

            this.didRejectTool = true
            return false
        }
        pushToolResult.call(this, formatResponse.toolDenied(), block)

        this.didRejectTool = true
        return false
    }
    return true
}

export const handleError = async function (this: any, action: string, error: Error) {
    const errorString = `Error ${action}: ${JSON.stringify(serializeError(error))}`
    await this.say(
        "error",
        `Error ${action}:\n${error.message ?? JSON.stringify(serializeError(error), null, 2)}`,
    )
    return formatResponse.toolError(errorString)
}