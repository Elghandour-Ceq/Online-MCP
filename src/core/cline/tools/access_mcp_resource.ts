import { formatResponse } from "../../prompts/responses"
import { AccessMcpResourceToolUse } from "../../assistant-message"
import { removeClosingTag, askApproval, handleError } from "./helpers"
import { ClineAskUseMcpServer } from "../../../shared/ExtensionMessage"
import { McpResourceResponse } from "../../../shared/mcp"
import { ToolResponse } from "../types"

export const access_mcp_resource = async function(this: any, block: AccessMcpResourceToolUse): Promise<ToolResponse | undefined> {
    const server_name = block.params.server_name
    const uri = block.params.uri
    try {
        if (block.partial) {
            const partialMessage = JSON.stringify({
                type: "access_mcp_resource",
                serverName: removeClosingTag("server_name", server_name) || "",
                uri: removeClosingTag("uri", uri) || "",
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
            const errorMsg = await this.sayAndCreateMissingParamError("access_mcp_resource", "server_name")
            return [{ type: "text" as const, text: errorMsg }]
        }
        if (!uri) {
            this.consecutiveMistakeCount++
            const errorMsg = await this.sayAndCreateMissingParamError("access_mcp_resource", "uri")
            return [{ type: "text" as const, text: errorMsg }]
        }

        this.consecutiveMistakeCount = 0
        const completeMessage = JSON.stringify({
            type: "access_mcp_resource",
            serverName: server_name,
            uri,
        } satisfies ClineAskUseMcpServer)

        // Show notification if auto-approval enabled
        this.showNotificationForApprovalIfAutoApprovalEnabled(
            `ZAKI wants to access ${uri} on ${server_name}`
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

        // Execute resource access
        await this.say("mcp_server_request_started")
        const resourceResult = await this.providerRef
            .deref()
            ?.mcpHub?.readResource(server_name, uri)

        // Format result
        const resourceResultPretty =
            resourceResult?.contents
                .map((item: McpResourceResponse["contents"][0]) => {
                    if (item.text) {
                        return item.text
                    }
                    return ""
                })
                .filter(Boolean)
                .join("\n\n") || "(Empty response)"
        
        await this.say("mcp_server_response", resourceResultPretty)
        return [{
            type: "text" as const,
            text: resourceResultPretty
        }]

    } catch (error) {
        const result = await handleError.call(this, "accessing MCP resource", error)
        return [{ type: "text" as const, text: result }]
    }
}
