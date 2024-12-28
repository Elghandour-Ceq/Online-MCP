import { ClineSayTool } from "../../../shared/ExtensionMessage"
import { getReadablePath } from "../../../utils/path"
import { formatResponse } from "../../prompts/responses"
import { ToolUse } from "../../assistant-message"
import * as path from "path"
import { parseSourceCodeForDefinitionsTopLevel } from "../../../services/tree-sitter"
import { removeClosingTag, askApproval, handleError } from "./helpers"
import { ToolResponse } from "../types"

export const list_code_definition_names = async function(this: any, block: ToolUse): Promise<ToolResponse | undefined> {
    const relDirPath: string | undefined = block.params.path
    const recursiveRaw: string | undefined = block.params.recursive
    const recursive = removeClosingTag("recursive", recursiveRaw)?.toLowerCase() === "true"
    
    const sharedMessageProps: ClineSayTool = {
        tool: "listCodeDefinitionNames",
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
            const errorMsg = await this.sayAndCreateMissingParamError("list_code_definition_names", "path")
            return [{ type: "text" as const, text: errorMsg }]
        }
        this.consecutiveMistakeCount = 0

        // Execute code definition parsing
        const absolutePath = path.resolve(this.cwd, relDirPath)
        const result = await parseSourceCodeForDefinitionsTopLevel(absolutePath, recursive)
        
        const completeMessage = JSON.stringify({
            ...sharedMessageProps,
            content: result,
        } satisfies ClineSayTool)

        // Show notification if auto-approval enabled
        this.showNotificationForApprovalIfAutoApprovalEnabled(
            `ZAKI wants to view source code definitions in ${path.basename(absolutePath)}${recursive ? ' recursively' : ''}`
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
        const result = await handleError.call(this, "parsing source code definitions", error)
        return [{ type: "text" as const, text: result }]
    }
}
