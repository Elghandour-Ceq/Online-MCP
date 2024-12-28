import { ClineSayTool } from "../../../shared/ExtensionMessage"
import { extractTextFromFile } from "../../../integrations/misc/extract-text"
import { getReadablePath } from "../../../utils/path"
import { ToolUse } from "../../assistant-message"
import * as path from "path"
import { removeClosingTag, askApproval, handleError } from "./helpers"
import { ToolResponse } from "../types"

export const read_file = async function(this: any, block: ToolUse): Promise<ToolResponse | undefined> {
    const relPath: string | undefined = block.params.path
    
    const sharedMessageProps: ClineSayTool = {
        tool: "readFile",
        path: getReadablePath(this.cwd, removeClosingTag("path", relPath)),
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
        if (!relPath) {
            this.consecutiveMistakeCount++
            const errorMsg = await this.sayAndCreateMissingParamError("read_file", "path")
            return [{ type: "text" as const, text: errorMsg }]
        }
        this.consecutiveMistakeCount = 0

        // Execute file read
        const absolutePath = path.resolve(this.cwd, relPath)
        const content = await extractTextFromFile(absolutePath)
        
        const completeMessage = JSON.stringify({
            ...sharedMessageProps,
            content,
        } satisfies ClineSayTool)

        // Show notification if auto-approval enabled
        this.showNotificationForApprovalIfAutoApprovalEnabled(
            `ZAKI wants to read ${path.basename(absolutePath)}`
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
            text: content
        }]

    } catch (error) {
        const result = await handleError.call(this, "reading file", error)
        return [{ type: "text" as const, text: result }]
    }
}
