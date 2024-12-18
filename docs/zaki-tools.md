# Zaki Tools Documentation

This document describes the available tools in Zaki and their usage.

## MCP Tools

### use_mcp_tool

Description: Execute a tool on a specified MCP server with optional arguments.

Parameters:
- server_name: (required) The name of the MCP server to use
- tool_name: (required) The name of the tool to execute
- arguments: (optional) JSON-formatted arguments to pass to the tool

Example:
```xml
<use_mcp_tool>
<server_name>my_server</server_name>
<tool_name>my_tool</tool_name>
<arguments>{"param1": "value1", "param2": "value2"}</arguments>
</use_mcp_tool>
```

Notes:
- If arguments are provided, they must be valid JSON
- The tool will return any text or resource responses from the server
- Errors will be returned if the server name or tool name is missing
- Invalid JSON arguments will result in an error response

### access_mcp_resource

Description: Access a resource from a specified MCP server using its URI.

Parameters:
- server_name: (required) The name of the MCP server to access
- uri: (required) The URI of the resource to access

Example:
```xml
<access_mcp_resource>
<server_name>my_server</server_name>
<uri>resource/path</uri>
</access_mcp_resource>
```

Notes:
- Both server_name and uri parameters are required
- The tool will return the contents of the requested resource
- Empty responses will be indicated with "(Empty response)"
- Errors will be returned if either parameter is missing
