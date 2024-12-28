import { formatResponse } from "../../prompts/responses"
import { ToolUse } from "../../assistant-message"
import { removeClosingTag, handleError } from "./helpers"
import { showSystemNotification } from "../../../integrations/notifications"
import { ToolResponse } from "../types"

export const ask_followup_question = async function(this: any, block: ToolUse): Promise<ToolResponse | undefined> {
    const question: string | undefined = block.params.question
    try {
        if (block.partial) {
            await this.ask("followup", removeClosingTag("question", question), block.partial).catch(() => {})
            return undefined
        }

        if (!question) {
            this.consecutiveMistakeCount++
            const errorMsg = await this.sayAndCreateMissingParamError("ask_followup_question", "question")
            return [{ type: "text" as const, text: errorMsg }]
        }
        this.consecutiveMistakeCount = 0

        if (
            this.autoApprovalSettings.enabled &&
            this.autoApprovalSettings.enableNotifications
        ) {
            showSystemNotification({
                subtitle: "Cline has a question...",
                message: question.replace(/\n/g, " "),
            })
        }

        const { text, images } = await this.ask("followup", question, false)
        await this.say("user_feedback", text ?? "", images)
        
        return [{ 
            type: "text" as const, 
            text: `<answer>\n${text}\n</answer>` 
        }, 
        ...(images ? formatResponse.imageBlocks(images) : [])]
    } catch (error) {
        const result = await handleError.call(this, "asking question", error)
        return [{ type: "text" as const, text: result }]
    }
}
