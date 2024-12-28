import { formatResponse } from "../../prompts/responses"
import { ToolUse } from "../../assistant-message"
import { removeClosingTag, askApproval, handleError } from "./helpers"
import { COMMAND_REQ_APP_STRING } from "../../../shared/combineCommandSequences"

export const execute_command = async function(this: any, block: ToolUse) {
    const command: string | undefined = block.params.command
    const requiresApprovalRaw: string | undefined = block.params.requires_approval
    const requiresApproval = requiresApprovalRaw?.toLowerCase() === "true"

    try {
        if (block.partial) {
            if (this.shouldAutoApproveTool(block.name)) {
                await this.say(
                    "command",
                    removeClosingTag("command", command),
                    undefined,
                    block.partial,
                ).catch(() => {})
            } else {
                await this.ask(
                    "command",
                    removeClosingTag("command", command),
                    block.partial,
                ).catch(() => {})
            }
            return
        } else {
            if (!command) {
                this.consecutiveMistakeCount++
                return [await this.sayAndCreateMissingParamError("execute_command", "command")]
            }
            if (!requiresApprovalRaw) {
                this.consecutiveMistakeCount++
                return [await this.sayAndCreateMissingParamError("execute_command", "requires_approval")]
            }
            this.consecutiveMistakeCount = 0

            if (!requiresApproval && this.shouldAutoApproveTool(block.name)) {
                await this.say("command", command, undefined, false)
                this.consecutiveAutoApprovedRequestsCount++
            } else {
                const didApprove = await askApproval.call(
                    this,
                    block,
                    "command",
                    command + `${this.shouldAutoApproveTool(block.name) && requiresApproval ? COMMAND_REQ_APP_STRING : ""}` // ugly hack until we refactor combineCommandSequences
                )
                if (!didApprove) {
                    return
                }
            }

            const [userRejected, result] = await this.executeCommandTool(command)
            if (userRejected) {
                this.didRejectTool = true
            }
            return [result]
        }
    } catch (error) {
        const result = await handleError.call(this, "executing command", error)
        return [result]
    }
}
