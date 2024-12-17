import { formatResponse } from "../../prompts/responses"
import { ToolUse } from "../../assistant-message"
import { removeClosingTag, handleError } from "./helpers"

export const ask_followup_question = async function(this: any, block: ToolUse) {
    const question: string | undefined = block.params.question
    try {
        if (block.partial) {
            await this.ask("followup", removeClosingTag("question", question), block.partial).catch(
                () => {},
            )
            return
        } else {
            if (!question) {
                this.consecutiveMistakeCount++
                return [await this.sayAndCreateMissingParamError("ask_followup_question", "question")]
            }
            this.consecutiveMistakeCount = 0
            const { text, images } = await this.ask("followup", question, false)
            await this.say("user_feedback", text ?? "", images)
            return [formatResponse.toolResult(`<answer>\n${text}\n</answer>`, images)]
        }
    } catch (error) {
        const result = await handleError.call(this, "asking question", error)
        return [result]
    }
}
