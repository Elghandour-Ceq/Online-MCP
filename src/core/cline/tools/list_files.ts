import { ClineSayTool } from "../../../shared/ExtensionMessage"
import { getReadablePath } from "../../../utils/path"
import { formatResponse } from "../../prompts/responses"
import { ToolUse } from "../../assistant-message"
import * as path from "path"
import { listFiles as listFilesUtil } from "../../../services/glob/list-files"
import { removeClosingTag, askApproval, handleError } from "./helpers"
import { ToolResponse } from "../types"

export const list_files = async function(this: any, block: ToolUse): Promise<ToolResponse | undefined> {
    const relDirPath: string | undefined = block.params.path
    const recursiveRaw: string | undefined = block.params.recursive
    const recursive = removeClosingTag("recursive", recursiveRaw)?.toLowerCase() === "true"
    
    const sharedMessageProps: ClineSayTool = {
        tool: !recursive ? "listFilesTopLevel" : "listFilesRecursive",
        path: getReadablePath(this.cwd, removeClosingTag("path", relDirPath)),
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
            const errorMsg = await this.sayAndCreateMissingParamError("list_files", "path")
            return [{ type: "text" as const, text: errorMsg }]
        }
        this.consecutiveMistakeCount = 0

        // Execute list files
        const absolutePath = path.resolve(this.cwd, relDirPath)
        const [files, didHitLimit] = await listFilesUtil(absolutePath, recursive, 200)
        const result = formatResponse.formatFilesList(absolutePath, files, didHitLimit)
        
        const completeMessage = JSON.stringify({
            ...sharedMessageProps,
            content: result,
        } satisfies ClineSayTool)

        // Show notification if auto-approval enabled
        this.showNotificationForApprovalIfAutoApprovalEnabled(
            `ZAKI wants to view directory ${path.basename(absolutePath)}${recursive ? ' recursively' : ''}`
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
            text: result
        }]

    } catch (error) {
        const result = await handleError.call(this, "listing files", error)
        return [{ type: "text" as const, text: result }]
    }
}
