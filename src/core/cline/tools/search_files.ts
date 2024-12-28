import { ClineSayTool } from "../../../shared/ExtensionMessage"
import { getReadablePath } from "../../../utils/path"
import { ToolUse } from "../../assistant-message"
import * as path from "path"
import { regexSearchFiles } from "../../../services/ripgrep"
import { removeClosingTag, askApproval, handleError } from "./helpers"
import { ToolResponse } from "../types"

export const search_files = async function(this: any, block: ToolUse): Promise<ToolResponse | undefined> {
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
                this.consecutiveAutoApprovedRequestsCount++
                await this.say("tool", partialMessage, undefined, block.partial)
            } else {
                await this.ask("tool", partialMessage, block.partial).catch(() => {})
            }
            return undefined
        }

        // Parameter validation
        if (!relDirPath) {
            this.consecutiveMistakeCount++
            const errorMsg = await this.sayAndCreateMissingParamError("search_files", "path")
            return [{ type: "text" as const, text: errorMsg }]
        }
        if (!regex) {
            this.consecutiveMistakeCount++
            const errorMsg = await this.sayAndCreateMissingParamError("search_files", "regex")
            return [{ type: "text" as const, text: errorMsg }]
        }
        this.consecutiveMistakeCount = 0

        // Execute search
        const absolutePath = path.resolve(this.cwd, relDirPath)
        const results = await regexSearchFiles(this.cwd, absolutePath, regex, filePattern)
        
        const completeMessage = JSON.stringify({
            ...sharedMessageProps,
            content: results,
        } satisfies ClineSayTool)

        // Show notification if auto-approval enabled
        this.showNotificationForApprovalIfAutoApprovalEnabled(
            `ZAKI wants to search files in ${path.basename(absolutePath)}/ for "${regex}"${filePattern ? ` (pattern: ${filePattern})` : ''}`
        )

        if (this.shouldAutoApproveTool(block.name)) {
            this.consecutiveAutoApprovedRequestsCount++
            await this.say("tool", completeMessage, undefined, false)
        } else {
            const didApprove = await askApproval.call(this, block, "tool", completeMessage)
            if (!didApprove) {
                return undefined
            }
        }

        return [{
            type: "text" as const,
            text: results
        }]

    } catch (error) {
        const result = await handleError.call(this, "searching files", error)
        return [{ type: "text" as const, text: result }]
    }
}
