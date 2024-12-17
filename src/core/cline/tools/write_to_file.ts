import { Anthropic } from "@anthropic-ai/sdk"
import delay from "delay"
import * as path from "path"

import { ClineSayTool } from "../../../shared/ExtensionMessage"
import { fileExistsAtPath } from "../../../utils/fs"
import { getReadablePath } from "../../../utils/path"
import { formatResponse } from "../../prompts/responses"
import { showOmissionWarning } from "../../../integrations/editor/detect-omission"
import { ToolUse } from "../../assistant-message"
import { removeClosingTag, askApproval, handleError } from "./helpers"

export const write_to_file = async function(this: any, block: ToolUse) {
    const relPath: string | undefined = block.params.path
    let newContent: string | undefined = block.params.content
    if (!relPath || !newContent) {
        // checking for newContent ensure relPath is complete
        // wait so we can determine if it's a new file or editing an existing file
        return
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

    // pre-processing newContent for cases where weaker models might add artifacts like markdown codeblock markers (deepseek/llama) or extra escape characters (gemini)
    if (newContent.startsWith("```")) {
        // this handles cases where it includes language specifiers like ```python ```js
        newContent = newContent.split("\n").slice(1).join("\n").trim()
    }
    if (newContent.endsWith("```")) {
        newContent = newContent.split("\n").slice(0, -1).join("\n").trim()
    }

    if (!this.api.getModel().id.includes("claude")) {
        // it seems not just llama models are doing this, but also gemini and potentially others
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

    const sharedMessageProps: ClineSayTool = {
        tool: fileExists ? "editedExistingFile" : "newFileCreated",
        path: getReadablePath(this.cwd, removeClosingTag("path", relPath)),
    }
    try {
        if (block.partial) {
            // update gui message
            const partialMessage = JSON.stringify(sharedMessageProps)
            await this.ask("tool", partialMessage, block.partial).catch(() => {})
            // update editor
            if (!this.diffViewProvider.isEditing) {
                // open the editor and prepare to stream content in
                await this.diffViewProvider.open(relPath)
            }
            // editor is open, stream content in
            await this.diffViewProvider.update(newContent, false)
            return
        } else {
            if (!relPath) {
                this.consecutiveMistakeCount++
                return [await this.sayAndCreateMissingParamError("write_to_file", "path")]
                await this.diffViewProvider.reset()
                return
            }
            if (!newContent) {
                this.consecutiveMistakeCount++
                return [await this.sayAndCreateMissingParamError("write_to_file", "content")]
                await this.diffViewProvider.reset()
                return
            }
            this.consecutiveMistakeCount = 0

            // if isEditingFile false, that means we have the full contents of the file already.
            // it's important to note how this function works, you can't make the assumption that the block.partial conditional will always be called since it may immediately get complete, non-partial data. So this part of the logic will always be called.
            // in other words, you must always repeat the block.partial logic here
            if (!this.diffViewProvider.isEditing) {
                // show gui message before showing edit animation
                const partialMessage = JSON.stringify(sharedMessageProps)
                await this.ask("tool", partialMessage, true).catch(() => {}) // sending true for partial even though it's not a partial, this shows the edit row before the content is streamed into the editor
                await this.diffViewProvider.open(relPath)
            }
            await this.diffViewProvider.update(newContent, true)
            await delay(300) // wait for diff view to update
            this.diffViewProvider.scrollToFirstDiff()
            showOmissionWarning(this.diffViewProvider.originalContent || "", newContent)

            const completeMessage = JSON.stringify({
                ...sharedMessageProps,
                content: fileExists ? undefined : newContent,
                diff: fileExists
                    ? formatResponse.createPrettyPatch(
                            relPath,
                            this.diffViewProvider.originalContent,
                            newContent,
                        )
                    : undefined,
            } satisfies ClineSayTool)
            const didApprove = await askApproval.call(this, block, "tool", completeMessage)
            if (!didApprove) {
                await this.diffViewProvider.revertChanges()
                return
            }
            const { newProblemsMessage, userEdits, finalContent } =
                await this.diffViewProvider.saveChanges()
            this.didEditFile = true // used to determine if we should wait for busy terminal to update before sending api request
            if (userEdits) {
                await this.say(
                    "user_feedback_diff",
                    JSON.stringify({
                        tool: fileExists ? "editedExistingFile" : "newFileCreated",
                        path: getReadablePath(this.cwd, relPath),
                        diff: userEdits,
                    } satisfies ClineSayTool),
                )
                return [
                    `The user made the following updates to your content:\n\n${userEdits}\n\n` +
                        `The updated content, which includes both your original modifications and the user's edits, has been successfully saved to ${relPath}. Here is the full, updated content of the file:\n\n` +
                        `<final_file_content path="${relPath}">\n${finalContent}\n</final_file_content>\n\n` +
                        `Please note:\n` +
                        `1. You do not need to re-write the file with these changes, as they have already been applied.\n` +
                        `2. Proceed with the task using this updated file content as the new baseline.\n` +
                        `3. If the user's edits have addressed part of the task or changed the requirements, adjust your approach accordingly.` +
                        `${newProblemsMessage}`
                ]
            } else {
                return [
                    `The content was successfully saved to ${relPath}.${newProblemsMessage}`
                ]
            }
            await this.diffViewProvider.reset()
            return
        }
    } catch (error) {
        const result = await handleError.call(this, "writing file", error)
        await this.diffViewProvider.reset()
        return [result]
    }
}
