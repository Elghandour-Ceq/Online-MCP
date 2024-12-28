import { ClineSayTool } from "../../../shared/ExtensionMessage"
import { getReadablePath } from "../../../utils/path"
import { ToolUse } from "../../assistant-message"
import * as path from "path"
import { regexSearchFiles } from "../../../services/ripgrep"
import { removeClosingTag, askApproval, handleError } from "./helpers"

export const search_files = async function(this: any, block: ToolUse) {
    const relDirPath: string | undefined = block.params.path
    const regex: string | undefined = block.params.regex
    const filePattern: string | undefined = block.params.file_pattern
    const sharedMessageProps: ClineSayTool = {
        tool: "searchFiles",
        path: getReadablePath(this.cwd, removeClosingTag("path", relDirPath)),
        regex: removeClosingTag("regex", regex),
        filePattern: removeClosingTag("file_pattern", filePattern),
    }
    try {
        if (block.partial) {
            const partialMessage = JSON.stringify({
                ...sharedMessageProps,
                content: "",
            } satisfies ClineSayTool)
            if (this.shouldAutoApproveTool(block.name)) {
                await this.say("tool", partialMessage, undefined, block.partial)
            } else {
                await this.ask("tool", partialMessage, block.partial).catch(() => {})
            }
            return
        } else {
            if (!relDirPath) {
                this.consecutiveMistakeCount++
                return [await this.sayAndCreateMissingParamError("search_files", "path")]
            }
            if (!regex) {
                this.consecutiveMistakeCount++
                return [await this.sayAndCreateMissingParamError("search_files", "regex")]
            }
            this.consecutiveMistakeCount = 0
            const absolutePath = path.resolve(this.cwd, relDirPath)

            this.showNotificationForApprovalIfAutoApprovalEnabled(
                `Zaki wants to search files in ${path.basename(absolutePath)}/`
            )

            const completeMessage = JSON.stringify({
                ...sharedMessageProps,
                content: "",
            } satisfies ClineSayTool)
            if (this.shouldAutoApproveTool(block.name)) {
                await this.say("tool", completeMessage, undefined, false)
            } else {
                const didApprove = await askApproval.call(this, block, "tool", completeMessage)
                if (!didApprove) {
                    return
                }
            }
            const results = await regexSearchFiles(this.cwd, absolutePath, regex, filePattern)
            return [results]
        }
    } catch (error) {
        const result = await handleError.call(this, "searching files", error)
        return [result]
    }
}
