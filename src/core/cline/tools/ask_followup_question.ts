import { formatResponse } from "../../prompts/responses"
import { ToolUse } from "../../assistant-message"
import { removeClosingTag, handleError } from "./helpers"
import { showSystemNotification } from "../../../integrations/notifications"

export const ask_followup_question = async function(this: any, block: ToolUse) {
    const question: string | undefined = block.params.question
    try {
        if (block.partial) {
            return
        } else {
            if (!question) {
                this.consecutiveMistakeCount++
                return [await this.sayAndCreateMissingParamError("ask_followup_question", "question")]
            }
            this.consecutiveMistakeCount = 0

            if (
                this.autoApprovalSettings.enabled &&
                this.autoApprovalSettings.enableNotifications
            ) {
                showSystemNotification({
                    subtitle: "Zaki has a question...",
                    message: question.replace(/\n/g, " "),
                })
            }

            await this.ask("question", question)
            return [formatResponse.toolResult("Question asked. Waiting for user response...")]
        }
    } catch (error) {
        const result = await handleError.call(this, "asking question", error)
        return [result]
    }
}
