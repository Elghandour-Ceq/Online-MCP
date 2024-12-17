import * as path from "path"
import * as os from "os"
import * as vscode from "vscode"
import { listFiles } from "../../services/glob/list-files"
import { formatResponse } from "../prompts/responses"
import { arePathsEqual, getReadablePath } from "../../utils/path"
import { parseMentions } from "../mentions"
import { formatContentBlockToMarkdown } from "../../integrations/misc/export-markdown"
import delay from "delay"
import pWaitFor from "p-wait-for"
import { UserContent } from "./types"
import { Anthropic } from "@anthropic-ai/sdk"

export async function loadContext(
    this: any, 
    userContent: UserContent, 
    includeFileDetails: boolean = false
): Promise<[UserContent, string]> {
    return await Promise.all([
        Promise.all(
            userContent.map(async (block: any) => {
                if (block.type === "text") {
                    return {
                        ...block,
                        text: await parseMentions(block.text, this.cwd, this.urlContentFetcher),
                    }
                } else if (block.type === "tool_result") {
                    const isUserMessage = (text: string) => text.includes("<feedback>") || text.includes("<answer>")
                    if (typeof block.content === "string" && isUserMessage(block.content)) {
                        return {
                            ...block,
                            content: await parseMentions(block.content, this.cwd, this.urlContentFetcher),
                        }
                    } else if (Array.isArray(block.content)) {
                        const parsedContent = await Promise.all(
                            block.content.map(async (contentBlock: any) => {
                                if (contentBlock.type === "text" && isUserMessage(contentBlock.text)) {
                                    return {
                                        ...contentBlock,
                                        text: await parseMentions(contentBlock.text, this.cwd, this.urlContentFetcher),
                                    }
                                }
                                return contentBlock
                            }),
                        )
                        return {
                            ...block,
                            content: parsedContent,
                        }
                    }
                }
                return block
            }),
        ),
        this.getEnvironmentDetails(includeFileDetails),
    ])
}

export async function getEnvironmentDetails(
    this: any, 
    includeFileDetails: boolean = false
): Promise<string> {
    let details = ""

    // Add system information
    details += "# SYSTEM INFORMATION\n"
    details += `Operating System: ${os.type()} ${os.release()}\n`
    details += `Default Shell: ${vscode.env.shell}\n`
    details += `Home Directory: ${os.homedir().toPosix()}\n`
    details += `Current Working Directory: ${this.cwd.toPosix()}\n`

    // It could be useful for cline to know if the user went from one or no file to another between messages, so we always include this context
    details += "\n\n# VSCode Visible Files"
    const visibleFiles = vscode.window.visibleTextEditors
        ?.map((editor) => editor.document?.uri?.fsPath)
        .filter(Boolean)
        .map((absolutePath) => path.relative(this.cwd, absolutePath).toPosix())
        .join("\n")
    if (visibleFiles) {
        details += `\n${visibleFiles}`
    } else {
        details += "\n(No visible files)"
    }

    details += "\n\n# VSCode Open Tabs"
    const openTabs = vscode.window.tabGroups.all
        .flatMap((group) => group.tabs)
        .map((tab) => (tab.input as vscode.TabInputText)?.uri?.fsPath)
        .filter(Boolean)
        .map((absolutePath) => path.relative(this.cwd, absolutePath).toPosix())
        .join("\n")
    if (openTabs) {
        details += `\n${openTabs}`
    } else {
        details += "\n(No open tabs)"
    }

    const busyTerminals = this.terminalManager.getTerminals(true)
    const inactiveTerminals = this.terminalManager.getTerminals(false)

    if (busyTerminals.length > 0 && this.didEditFile) {
        await delay(300) // delay after saving file to let terminals catch up
    }

    if (busyTerminals.length > 0) {
        await pWaitFor(() => busyTerminals.every((t: any) => !this.terminalManager.isProcessHot(t.id)), {
            interval: 100,
            timeout: 15_000,
        }).catch(() => {})
    }

    this.didEditFile = false // reset, this lets us know when to wait for saved files to update terminals

    let terminalDetails = ""
    if (busyTerminals.length > 0) {
        // terminals are cool, let's retrieve their output
        terminalDetails += "\n\n# Actively Running Terminals"
        for (const busyTerminal of busyTerminals) {
            terminalDetails += `\n## Original command: \`${busyTerminal.lastCommand}\``
            const newOutput = this.terminalManager.getUnretrievedOutput(busyTerminal.id)
            if (newOutput) {
                terminalDetails += `\n### New Output\n${newOutput}`
            }
        }
    }

    // only show inactive terminals if there's output to show
    if (inactiveTerminals.length > 0) {
        const inactiveTerminalOutputs = new Map<number, string>()
        for (const inactiveTerminal of inactiveTerminals) {
            const newOutput = this.terminalManager.getUnretrievedOutput(inactiveTerminal.id)
            if (newOutput) {
                inactiveTerminalOutputs.set(inactiveTerminal.id, newOutput)
            }
        }
        if (inactiveTerminalOutputs.size > 0) {
            terminalDetails += "\n\n# Inactive Terminals"
            for (const [terminalId, newOutput] of inactiveTerminalOutputs) {
                const inactiveTerminal = inactiveTerminals.find((t: any) => t.id === terminalId)
                if (inactiveTerminal) {
                    terminalDetails += `\n## ${inactiveTerminal.lastCommand}`
                    terminalDetails += `\n### New Output\n${newOutput}`
                }
            }
        }
    }

    if (terminalDetails) {
        details += terminalDetails
    }

    if (includeFileDetails) {
        details += `\n\n# Current Working Directory (${this.cwd.toPosix()}) Files\n`
        const isDesktop = arePathsEqual(this.cwd, path.join(os.homedir(), "Desktop"))
        if (isDesktop) {
            // don't want to immediately access desktop since it would show permission popup
            details += "(Desktop files not shown automatically. Use list_files to explore if needed.)"
        } else {
            const [files, didHitLimit] = await listFiles(this.cwd, true, 200)
            const result = formatResponse.formatFilesList(this.cwd, files, didHitLimit)
            details += result
        }
    }

    return `<environment_details>\n${details.trim()}\n</environment_details>`
}
