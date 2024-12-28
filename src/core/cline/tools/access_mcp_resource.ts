import { formatResponse } from "../../prompts/responses"
import { AccessMcpResourceToolUse } from "../../assistant-message"
import { askApproval, handleError } from "./helpers"
import { ClineAskUseMcpServer } from "../../../shared/ExtensionMessage"
import { McpResourceResponse } from "../../../shared/mcp"

export const access_mcp_resource = async function(this: any, block: AccessMcpResourceToolUse) {
    const server_name = block.params.server_name
    const uri = block.params.uri
    try {
        if (block.partial) {
            const partialMessage = JSON.stringify({
                type: "access_mcp_resource",
                serverName: server_name || "",
                uri: uri || "",
            } satisfies ClineAskUseMcpServer)
            if (this.shouldAutoApproveTool(block.name)) {
                await this.say("use_mcp_server", partialMessage, undefined, block.partial).catch(() => {})
            } else {
                await this.ask("use_mcp_server", partialMessage, block.partial).catch(() => {})
            }
            return
        } else {
            if (!server_name) {
                this.consecutiveMistakeCount++
                return [await this.sayAndCreateMissingParamError("access_mcp_resource", "server_name")]
            }
            if (!uri) {
                this.consecutiveMistakeCount++
                return [await this.sayAndCreateMissingParamError("access_mcp_resource", "uri")]
            }

            this.consecutiveMistakeCount = 0
            const completeMessage = JSON.stringify({
                type: "access_mcp_resource",
                serverName: server_name,
                uri,
            } satisfies ClineAskUseMcpServer)

            if (this.shouldAutoApproveTool(block.name)) {
                await this.say("use_mcp_server", completeMessage, undefined, false)
                this.consecutiveAutoApprovedRequestsCount++
            } else {
                const didApprove = await askApproval.call(this, block, "use_mcp_server", completeMessage)
                if (!didApprove) {
                    return
                }
            }

            await this.say("mcp_server_request_started")
            const resourceResult = await this.providerRef
                .deref()
                ?.mcpHub?.readResource(server_name, uri)

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
            return [formatResponse.toolResult(resourceResultPretty)]
        }
    } catch (error) {
        const result = await handleError.call(this, "accessing MCP resource", error)
        return [result]
    }
}
