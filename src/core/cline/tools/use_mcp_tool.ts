import { formatResponse } from "../../prompts/responses"
import { ToolUse, UseMcpToolToolUse } from "../../assistant-message"
import { removeClosingTag, askApproval, handleError } from "./helpers"
import { ClineAskUseMcpServer } from "../../../shared/ExtensionMessage"
import { McpToolCallResponse } from "../../../shared/mcp"
import { ToolResponse } from "../types"

export const use_mcp_tool = async function(this: any, block: UseMcpToolToolUse): Promise<ToolResponse | undefined> {
    const server_name = block.params.server_name
    const tool_name = block.params.tool_name
    const mcp_arguments = block.params.arguments
    try {
        if (block.partial) {
            const partialMessage = JSON.stringify({
                type: "use_mcp_tool",
                serverName: removeClosingTag("server_name", server_name) || "",
                toolName: removeClosingTag("tool_name", tool_name) || "",
                arguments: removeClosingTag("arguments", mcp_arguments) || "",
            } satisfies ClineAskUseMcpServer)

            if (this.shouldAutoApproveTool(block.name)) {
                this.consecutiveAutoApprovedRequestsCount++
                await this.say("use_mcp_server", partialMessage, undefined, block.partial)
            } else {
                await this.ask("use_mcp_server", partialMessage, block.partial).catch(() => {})
            }
            return undefined
        }

        // Parameter validation
        if (!server_name) {
            this.consecutiveMistakeCount++
            const errorMsg = await this.sayAndCreateMissingParamError("use_mcp_tool", "server_name")
            return [{ type: "text" as const, text: errorMsg }]
        }
        if (!tool_name) {
            this.consecutiveMistakeCount++
            const errorMsg = await this.sayAndCreateMissingParamError("use_mcp_tool", "tool_name")
            return [{ type: "text" as const, text: errorMsg }]
        }

        // Parse arguments if present
        let parsedArguments: Record<string, unknown> | undefined
        if (mcp_arguments) {
            try {
                parsedArguments = JSON.parse(mcp_arguments)
            } catch (error) {
                this.consecutiveMistakeCount++
                await this.say(
                    "error",
                    `Cline tried to use ${tool_name} with an invalid JSON argument. Retrying...`
                )
                return [{
                    type: "text" as const,
                    text: formatResponse.toolError(
                        `Invalid JSON argument for tool ${tool_name} on server ${server_name}`
                    )
                }]
            }
        }

        this.consecutiveMistakeCount = 0
        const completeMessage = JSON.stringify({
            type: "use_mcp_tool",
            serverName: server_name,
            toolName: tool_name,
            arguments: mcp_arguments,
        } satisfies ClineAskUseMcpServer)

        // Show notification if auto-approval enabled
        this.showNotificationForApprovalIfAutoApprovalEnabled(
            `ZAKI wants to use ${tool_name} on ${server_name}`
        )

        if (this.shouldAutoApproveTool(block.name)) {
            this.consecutiveAutoApprovedRequestsCount++
            await this.say("use_mcp_server", completeMessage, undefined, false)
        } else {
            const didApprove = await askApproval.call(this, block, "use_mcp_server", completeMessage)
            if (!didApprove) {
                return undefined
            }
        }

        // Execute tool
        await this.say("mcp_server_request_started")
        const toolResult = await this.providerRef
            .deref()
            ?.mcpHub?.callTool(server_name, tool_name, parsedArguments)

        // Format result
        const toolResultPretty = 
            (toolResult?.isError ? "Error:\n" : "") +
            toolResult?.content
                .map((item: McpToolCallResponse["content"][0]) => {
                    if (item.type === "text") {
                        return item.text
                    }
                    if (item.type === "resource") {
                        const { blob, ...rest } = item.resource
                        return JSON.stringify(rest, null, 2)
                    }
                    return ""
                })
                .filter(Boolean)
                .join("\n\n") || "(No response)"
        
        await this.say("mcp_server_response", toolResultPretty)
        return [{
            type: "text" as const,
            text: toolResultPretty
        }]

    } catch (error) {
        const result = await handleError.call(this, "executing MCP tool", error)
        return [{ type: "text" as const, text: result }]
    }
}
