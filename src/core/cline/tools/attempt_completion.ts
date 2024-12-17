import { formatResponse } from "../../prompts/responses"
import { ToolUse } from "../../assistant-message"
import { Anthropic } from "@anthropic-ai/sdk"
import { removeClosingTag, askApproval, handleError } from "./helpers"

export const attempt_completion = async function (this: any, block: ToolUse) {
    const result: string | undefined = block.params.result
    const command: string | undefined = block.params.command
    try {
        const lastMessage = this.clineMessages.at(-1)
        if (block.partial) {
            if (command) {
                if (lastMessage && lastMessage.ask === "command") {
                    await this.ask(
                        "command",
                        removeClosingTag("command", command),
                        block.partial,
                    ).catch(() => { })
                } else {
                    await this.say(
                        "completion_result",
                        removeClosingTag("result", result),
                        undefined,
                        false,
                    )
                    await this.ask(
                        "command",
                        removeClosingTag("command", command),
                        block.partial,
                    ).catch(() => { })
                }
            } else {
                await this.say(
                    "completion_result",
                    removeClosingTag("result", result),
                    undefined,
                    block.partial,
                )
            }
            return
        } else {
            if (!result) {
                this.consecutiveMistakeCount++
                return [await this.sayAndCreateMissingParamError("attempt_completion", "result")]
            }
            this.consecutiveMistakeCount = 0

            let commandResult: string | (Anthropic.TextBlockParam | Anthropic.ImageBlockParam)[] | undefined
            if (command) {
                if (lastMessage && lastMessage.ask !== "command") {
                    await this.say("completion_result", result, undefined, false)
                }

                const didApprove = await askApproval.call(this, block, "command", command)
                if (!didApprove) {
                    return
                }
                const [userRejected, execCommandResult] = await this.executeCommandTool(command!)
                if (userRejected) {
                    this.didRejectTool = true
                    return [execCommandResult]
                }
                commandResult = execCommandResult
            } else {
                await this.say("completion_result", result, undefined, false)
            }

            const { response, text, images } = await this.ask("completion_result", "", false)
            if (response === "yesButtonClicked") {
                return [""]
            }
            await this.say("user_feedback", text ?? "", images)

            const toolResults: (Anthropic.TextBlockParam | Anthropic.ImageBlockParam)[] = []
            if (commandResult) {
                if (typeof commandResult === "string") {
                    toolResults.push({ type: "text", text: commandResult })
                } else if (Array.isArray(commandResult)) {
                    toolResults.push(...commandResult)
                }
            }
            toolResults.push({
                type: "text",
                text: `The user has provided feedback on the results. Consider their input to continue the task, and then attempt completion again.\n<feedback>\n${text}\n</feedback>`,
            })
            toolResults.push(...formatResponse.imageBlocks(images))
            return toolResults
        }
    } catch (error) {
        const result = await handleError.call(this, "attempting completion", error)
        return [result]
    }
}
