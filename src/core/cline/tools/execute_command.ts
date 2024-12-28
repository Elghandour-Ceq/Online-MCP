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
            // since depending on an upcoming parameter, requiresApproval this may become an ask - we cant partially stream a say prematurely. So in this particular case we have to wait for the requiresApproval parameter to be completed before presenting it.
            // await this.say(
            //     "command",
            //     removeClosingTag("command", command),
            //     undefined,
            //     block.partial,
            // ).catch(() => {})
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

            const didAutoApprove = !requiresApproval && this.shouldAutoApproveTool(block.name)
            if (didAutoApprove) {
                this.consecutiveAutoApprovedRequestsCount++
                await this.say("command", command, undefined, false)
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

            let timeoutId: NodeJS.Timeout | undefined
            if (didAutoApprove && this.autoApprovalSettings.enableNotifications) {
                // if the command was auto-approved, and it's long running we need to notify the user after some time has passed without proceeding
                timeoutId = setTimeout(() => {
                    this.showNotificationForApprovalIfAutoApprovalEnabled(
                        "An auto-approved command has been running for 30s, and may need your attention."
                    )
                }, 30_000)
            }

            const [userRejected, result] = await this.executeCommandTool(command)
            if (timeoutId) {
                clearTimeout(timeoutId)
            }
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
