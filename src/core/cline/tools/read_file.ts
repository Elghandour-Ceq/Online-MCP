import { ClineSayTool } from "../../../shared/ExtensionMessage"
import { extractTextFromFile } from "../../../integrations/misc/extract-text"
import { getReadablePath } from "../../../utils/path"
import { ToolUse } from "../../assistant-message"
import * as path from "path"
import { removeClosingTag, askApproval, handleError } from "./helpers"

export const read_file = async function(this: any, block: ToolUse) {
    const relPath: string | undefined = block.params.path
    const sharedMessageProps: ClineSayTool = {
        tool: "readFile",
        path: getReadablePath(this.cwd, removeClosingTag("path", relPath)),
    }
    try {
        if (block.partial) {
            const partialMessage = JSON.stringify({
                ...sharedMessageProps,
                content: undefined,
            } satisfies ClineSayTool)
            if (this.shouldAutoApproveTool(block.name)) {
                await this.say("tool", partialMessage, undefined, block.partial)
            } else {
                await this.ask("tool", partialMessage, block.partial).catch(() => {})
            }
            return
        } else {
            if (!relPath) {
                this.consecutiveMistakeCount++
                return [await this.sayAndCreateMissingParamError("read_file", "path")]
            }
            this.consecutiveMistakeCount = 0
            const absolutePath = path.resolve(this.cwd, relPath)
            const completeMessage = JSON.stringify({
                ...sharedMessageProps,
                content: absolutePath,
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
            // now execute the tool like normal
            const content = await extractTextFromFile(absolutePath)
            return [content]
        }
    } catch (error) {
        const result = await handleError.call(this, "reading file", error)
        return [result]
    }
}
