import { ClineSayTool } from "../../../shared/ExtensionMessage"
import { getReadablePath } from "../../../utils/path"
import { formatResponse } from "../../prompts/responses"
import { ToolUse } from "../../assistant-message"
import * as path from "path"
import { listFiles as listFilesUtil } from "../../../services/glob/list-files"
import { removeClosingTag, askApproval, handleError } from "./helpers"

export const list_files = async function(this: any, block: ToolUse) {
    const relDirPath: string | undefined = block.params.path
    const recursiveRaw: string | undefined = block.params.recursive
    const recursive = recursiveRaw?.toLowerCase() === "true"
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
                await this.say("tool", partialMessage, undefined, block.partial)
            } else {
                await this.ask("tool", partialMessage, block.partial).catch(() => {})
            }
            return
        } else {
            if (!relDirPath) {
                this.consecutiveMistakeCount++
                return [await this.sayAndCreateMissingParamError("list_files", "path")]
            }
            this.consecutiveMistakeCount = 0
            const absolutePath = path.resolve(this.cwd, relDirPath)
            const [files, didHitLimit] = await listFilesUtil(absolutePath, recursive, 200)
            const result = formatResponse.formatFilesList(absolutePath, files, didHitLimit)
            const completeMessage = JSON.stringify({
                ...sharedMessageProps,
                content: result,
            } satisfies ClineSayTool)
            if (this.shouldAutoApproveTool(block.name)) {
                await this.say("tool", completeMessage, undefined, false)
                this.consecutiveAutoApprovedRequestsCount++
            } else {
                const didApprove = await askApproval.call(this, block, "tool", completeMessage)
                if (!didApprove) {
                    return
                }
            }
            return [result]
        }
    } catch (error) {
        const result = await handleError.call(this, "listing files", error)
        return [result]
    }
}
