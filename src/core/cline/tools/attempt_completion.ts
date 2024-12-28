import { formatResponse } from "../../prompts/responses"
import { ToolUse } from "../../assistant-message"
import { removeClosingTag, handleError } from "./helpers"
import { showSystemNotification } from "../../../integrations/notifications"

export const attempt_completion = async function(this: any, block: ToolUse) {
    const result: string | undefined = block.params.result
    const command: string | undefined = block.params.command
    try {
        if (block.partial) {
            return
        } else {
            if (!result) {
                this.consecutiveMistakeCount++
                return [await this.sayAndCreateMissingParamError("attempt_completion", "result")]
            }
            this.consecutiveMistakeCount = 0

            if (
                this.autoApprovalSettings.enabled &&
                this.autoApprovalSettings.enableNotifications
            ) {
                showSystemNotification({
                    subtitle: "Task Completed",
                    message: result.replace(/\n/g, " "),
                })
            }

            await this.ask("completion", JSON.stringify({ result, command }))
            return [formatResponse.toolResult("Completion attempt made. Waiting for user feedback...")]
        }
    } catch (error) {
        const result = await handleError.call(this, "attempting completion", error)
        return [result]
    }
}
