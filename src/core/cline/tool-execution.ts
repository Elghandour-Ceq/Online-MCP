import { ToolResponse } from "./types"
import { formatResponse } from "../prompts/responses"

const MAX_LINES = 200

function truncateOutput(output: string): string {
    const lines = output.split('\n')
    if (lines.length > MAX_LINES) {
        const truncated = lines.slice(0, MAX_LINES).join('\n')
        return `${truncated}\n\n... Output truncated. Showing ${MAX_LINES} of ${lines.length} lines ...`
    }
    return output
}

export const executeCommandTool = async function(this: any, command: string): Promise<[boolean, ToolResponse]> {
    const terminalInfo = await this.terminalManager.getOrCreateTerminal(this.cwd)
    terminalInfo.terminal.show()
    const process = this.terminalManager.runCommand(terminalInfo, command)

    let userFeedback: { text?: string; images?: string[] } | undefined
    let didContinue = false
    const sendCommandOutput = async (line: string): Promise<void> => {
        try {
            const { response, text, images } = await this.ask("command_output", line)
            if (response === "yesButtonClicked") {
                // proceed while running
            } else {
                userFeedback = { text, images }
            }
            didContinue = true
            process.continue()
        } catch {
            // This can only happen if this ask promise was ignored, so ignore this error
        }
    }

    let result = ""
    process.on("line", (line: string) => {
        result += line + "\n"
        if (!didContinue) {
            sendCommandOutput(line)
        } else {
            this.say("command_output", line)
        }
    })

    let completed = false
    process.once("completed", () => {
        completed = true
    })

    process.once("no_shell_integration", async () => {
        await this.say("shell_integration_warning")
    })

    await process

    // Wait for a short delay to ensure all messages are sent to the webview
    await new Promise(resolve => setTimeout(resolve, 50))

    // Trim and truncate the result
    result = result.trim()
    result = truncateOutput(result)

    if (userFeedback) {
        await this.say("user_feedback", userFeedback.text, userFeedback.images)
        return [
            true,
            formatResponse.toolResult(
                `Command is still running in the user's terminal.${
                    result.length > 0 ? `\nHere's the output so far:\n${result}` : ""
                }\n\nThe user provided the following feedback:\n<feedback>\n${userFeedback.text}\n</feedback>`,
                userFeedback.images,
            ),
        ]
    }

    if (completed) {
        return [false, `Command executed.${result.length > 0 ? `\nOutput:\n${result}` : ""}`]
    } else {
        return [
            false,
            `Command is still running in the user's terminal.${
                result.length > 0 ? `\nHere's the output so far:\n${result}` : ""
            }\n\nYou will be updated on the terminal status and new output in the future.`,
        ]
    }
}
