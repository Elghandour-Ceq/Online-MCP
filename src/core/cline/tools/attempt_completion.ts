import { Anthropic } from "@anthropic-ai/sdk"
import { formatResponse } from "../../prompts/responses"
import { ToolUse } from "../../assistant-message"
import { removeClosingTag, askApproval, handleError } from "./helpers"
import { showSystemNotification } from "../../../integrations/notifications"
import { ToolResponse } from "../types"

export const attempt_completion = async function(this: any, block: ToolUse): Promise<ToolResponse | undefined> {
    const result: string | undefined = block.params.result
    const command: string | undefined = block.params.command

    try {
        // Handle partial updates
        if (block.partial) {
            if (command) {
                // First handle completion result
                if (this.clineMessages.at(-1)?.ask !== "command") {
                    await this.say("completion_result", removeClosingTag("result", result), undefined, true)
                }
                // Then handle command
                await this.ask("command", removeClosingTag("command", command), block.partial).catch(() => {})
            } else {
                await this.say("completion_result", removeClosingTag("result", result), undefined, block.partial)
            }
            return undefined
        }

        // Parameter validation
        if (!result) {
            this.consecutiveMistakeCount++
            const errorMsg = await this.sayAndCreateMissingParamError("attempt_completion", "result")
            return [{ type: "text" as const, text: errorMsg }]
        }
        this.consecutiveMistakeCount = 0

        // Show notification if enabled
        if (
            this.autoApprovalSettings.enabled &&
            this.autoApprovalSettings.enableNotifications
        ) {
            showSystemNotification({
                subtitle: "Task Completed",
                message: result.replace(/\n/g, " "),
            })
        }

        // Handle command if present
        let commandResult: ToolResponse | undefined
        if (command) {
            // First send completion result
            await this.say("completion_result", result, undefined, false)

            // Then handle command
            const didApprove = await askApproval.call(this, block, "command", command)
            if (!didApprove) {
                return undefined
            }
            const [userRejected, execCommandResult] = await this.executeCommandTool(command)
            if (userRejected) {
                this.didRejectTool = true
                return [{ type: "text" as const, text: execCommandResult }]
            }
            commandResult = execCommandResult
        } else {
            // Just send completion result
            if (this.shouldAutoApproveTool(block.name)) {
                this.consecutiveAutoApprovedRequestsCount++
                await this.say("completion_result", result, undefined, false)
            } else {
                const didApprove = await askApproval.call(this, block, "completion_result", result)
                if (!didApprove) {
                    return undefined
                }
            }
        }

        // Get user feedback
        const { response, text, images } = await this.ask("completion_result", "", false)
        if (response === "yesButtonClicked") {
            return [{ type: "text" as const, text: "" }] // Signals to recursive loop to stop
        }
        await this.say("user_feedback", text ?? "", images)

        // Format tool results
        const toolResults: Array<Anthropic.TextBlockParam | Anthropic.ImageBlockParam> = []
        if (commandResult) {
            if (typeof commandResult === "string") {
                toolResults.push({ type: "text" as const, text: commandResult })
            } else {
                toolResults.push(...commandResult)
            }
        }
        toolResults.push({
            type: "text" as const,
            text: `The user has provided feedback on the results. Consider their input to continue the task, and then attempt completion again.\n<feedback>\n${text}\n</feedback>`,
        })
        if (images) {
            toolResults.push(...formatResponse.imageBlocks(images))
        }
        return toolResults

    } catch (error) {
        const result = await handleError.call(this, "attempting completion", error)
        return [{ type: "text" as const, text: result }]
    }
}
