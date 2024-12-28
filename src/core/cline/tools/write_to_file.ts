import { Anthropic } from "@anthropic-ai/sdk"
import delay from "delay"
import * as path from "path"

import { ClineSayTool } from "../../../shared/ExtensionMessage"
import { fileExistsAtPath } from "../../../utils/fs"
import { getReadablePath } from "../../../utils/path"
import { formatResponse } from "../../prompts/responses"
import { showOmissionWarning } from "../../../integrations/editor/detect-omission"
import { ToolUse } from "../../assistant-message"
import { constructNewFileContent } from "../../assistant-message/diff"
import { removeClosingTag, askApproval, handleError } from "./helpers"
import { ToolResponse } from "../types"

export const write_to_file = async function(this: any, block: ToolUse): Promise<ToolResponse | undefined> {
    const relPath: string | undefined = block.params.path
    let diff: string | undefined = block.params.diff
    
    // Early parameter validation
    if (!relPath || !diff) {
        if (!relPath) {
            this.consecutiveMistakeCount++
            const errorMsg = await this.sayAndCreateMissingParamError("write_to_file", "path")
            return [{ type: "text", text: errorMsg }]
        }
        if (!diff) {
            this.consecutiveMistakeCount++
            const errorMsg = await this.sayAndCreateMissingParamError("write_to_file", "diff")
            return [{ type: "text", text: errorMsg }]
        }
        return undefined
    }

    // Check if file exists using cached map or fs.access
    let fileExists: boolean
    if (this.diffViewProvider.editType !== undefined) {
        fileExists = this.diffViewProvider.editType === "modify"
    } else {
        const absolutePath = path.resolve(this.cwd, relPath)
        fileExists = await fileExistsAtPath(absolutePath)
        this.diffViewProvider.editType = fileExists ? "modify" : "create"
    }

    const sharedMessageProps: ClineSayTool = {
        tool: fileExists ? "editedExistingFile" : "newFileCreated",
        path: getReadablePath(this.cwd, removeClosingTag("path", relPath)),
    }

    try {
        let newContent = await constructNewFileContent(
            diff,
            this.diffViewProvider.originalContent || "",
            !block.partial,
        )

        if (!this.api.getModel().id.includes("claude")) {
            // Handle content preprocessing for non-Claude models
            if (
                newContent.includes("&gt;") ||
                newContent.includes("&lt;") ||
                newContent.includes("&quot;")
            ) {
                newContent = newContent
                    .replace(/&gt;/g, ">")
                    .replace(/&lt;/g, "<")
                    .replace(/&quot;/g, '"')
            }
        }
        newContent = newContent.trimEnd() // remove any trailing newlines

        if (block.partial) {
            // Handle partial updates
            const partialMessage = JSON.stringify(sharedMessageProps)
            await this.ask("tool", partialMessage, block.partial).catch(() => {})
            
            if (!this.diffViewProvider.isEditing) {
                await this.diffViewProvider.open(relPath)
            }
            await this.diffViewProvider.update(newContent, false)
            return undefined
        }

        // Handle complete updates
        this.consecutiveMistakeCount = 0

        if (!this.diffViewProvider.isEditing) {
            const partialMessage = JSON.stringify(sharedMessageProps)
            await this.ask("tool", partialMessage, true).catch(() => {})
            await this.diffViewProvider.open(relPath)
        }

        await this.diffViewProvider.update(newContent, true)
        await delay(300)
        this.diffViewProvider.scrollToFirstDiff()

        const completeMessage = JSON.stringify({
            ...sharedMessageProps,
            content: fileExists ? undefined : newContent,
            diff: fileExists ? diff : undefined,
        } satisfies ClineSayTool)

        const didApprove = await askApproval.call(this, block, "tool", completeMessage)
        if (!didApprove) {
            await this.diffViewProvider.revertChanges()
            return undefined
        }

        const { newProblemsMessage, userEdits, finalContent } = await this.diffViewProvider.saveChanges()
        this.didEditFile = true

        if (userEdits) {
            await this.say(
                "user_feedback_diff",
                JSON.stringify({
                    tool: fileExists ? "editedExistingFile" : "newFileCreated",
                    path: getReadablePath(this.cwd, relPath),
                    diff: userEdits,
                } satisfies ClineSayTool)
            )

            return [{
                type: "text",
                text: `The user made the following updates to your content:\n\n${userEdits}\n\n` +
                    `The updated content, which includes both your original modifications and the user's edits, has been successfully saved to ${relPath}. Here is the full, updated content of the file:\n\n` +
                    `<final_file_content path="${relPath}">\n${finalContent}\n</final_file_content>\n\n` +
                    `IMPORTANT: If you need to make further changes to this file, use this final_file_content as the new baseline for your changes, as it is now the current state of the file (including the user's edits and any auto-formatting done by the system). \n\n` +
                    `Please note:\n` +
                    `1. You do not need to re-write the file with these changes, as they have already been applied.\n` +
                    `2. Proceed with the task using this updated file content as the new baseline.\n` +
                    `3. If the user's edits have addressed part of the task or changed the requirements, adjust your approach accordingly.` +
                    `${newProblemsMessage}`
            }]
        }

        await this.diffViewProvider.reset()
        return [{
            type: "text",
            text: `The content was successfully saved to ${relPath}.\n\n` +
                `Here is the full, updated content of the file:\n\n` +
                `<final_file_content path="${relPath}">\n${finalContent}\n</final_file_content>\n\n` +
                `IMPORTANT: If you need to make further changes to this file, use this final_file_content as the new baseline for your changes, as it is now the current state of the file (including any auto-formatting done by the system). \n\n` +
                `${newProblemsMessage}`
        }]
    } catch (error) {
        const result = await handleError.call(this, "writing file", error)
        await this.diffViewProvider.reset()
        return [{ type: "text", text: result }]
    }
}