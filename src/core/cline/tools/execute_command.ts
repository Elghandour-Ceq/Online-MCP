import { formatResponse } from "../../prompts/responses"
import { ToolUse } from "../../assistant-message"
import { removeClosingTag, askApproval, handleError } from "./helpers"

export const execute_command = async function(this: any, block: ToolUse) {
    const command: string | undefined = block.params.command
    try {
        if (block.partial) {
            await this.ask("command", removeClosingTag("command", command), block.partial).catch(
                () => {},
            )
            return
        } else {
            if (!command) {
                this.consecutiveMistakeCount++
                return [await this.sayAndCreateMissingParamError("execute_command", "command")]
            }
            this.consecutiveMistakeCount = 0
            const didApprove = await askApproval.call(this, block, "command", command)
            if (!didApprove) {
                return
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
