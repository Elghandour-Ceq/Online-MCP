import { ClineSayTool } from "../../../shared/ExtensionMessage"
import { getReadablePath } from "../../../utils/path"
import { formatResponse } from "../../prompts/responses"
import { ToolUse } from "../../assistant-message"
import * as path from "path"
import { parseSourceCodeForDefinitionsTopLevel } from "../../../services/tree-sitter"
import { removeClosingTag, askApproval, handleError } from "./helpers"

export const list_code_definition_names = async function(this: any, block: ToolUse) {
    const relDirPath: string | undefined = block.params.path
    const recursive: boolean = block.params.recursive === 'true'
    console.log('[list_code_definition_names]','Input path parameter:', relDirPath)
    console.log('[list_code_definition_names]','Recursive parameter:', recursive)
    console.log('[list_code_definition_names]','Current working directory:', this.cwd)
    
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
                await this.say("tool", partialMessage, undefined, block.partial)
            } else {
                await this.ask("tool", partialMessage, block.partial).catch(() => {})
            }
            return
        } else {
            if (!relDirPath) {
                console.log('[list_code_definition_names]','No path parameter provided')
                this.consecutiveMistakeCount++
                return [await this.sayAndCreateMissingParamError("list_code_definition_names", "path")]
            }
            this.consecutiveMistakeCount = 0
            const absolutePath = path.resolve(this.cwd, relDirPath)
            console.log('[list_code_definition_names]','Resolved absolute path:', absolutePath)
           
            
            const result = await parseSourceCodeForDefinitionsTopLevel(absolutePath, recursive)
            console.log('[list_code_definition_names]','Parser result:', result)
            
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
        console.log('[list_code_definition_names]','Error occurred:', error)
        const result = await handleError.call(this, "parsing source code definitions", error)
        return [result]
    }
}
