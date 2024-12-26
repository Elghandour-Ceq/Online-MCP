# Understanding MCP and Jira Integration

## Quick Start

1. **Install Dependencies**
```bash
cd /path/to/list-jira-tickets
npm install
```

2. **Build the Project**
```bash
npm run build
```

3. **Configure Environment**
Create or update the MCP settings file at `~/.vscode-server/data/User/globalStorage/saoudrizwan.claude-dev/settings/cline_mcp_settings.json`:
```json
{
  "mcpServers": {
    "list-jira-tickets-server": {
      "command": "node",
      "args": ["/absolute/path/to/list-jira-tickets/build/index.js"],
      "env": {
        "JIRA_HOST": "your-company.atlassian.net",
        "JIRA_USERNAME": "your.email@company.com",
        "JIRA_API_TOKEN": "your-jira-api-token"
      }
    }
  }
}
```

4. **Run the Server**
```bash
cd /path/to/list-jira-tickets
JIRA_HOST="your-company.atlassian.net" \
JIRA_USERNAME="your.email@company.com" \
JIRA_API_TOKEN="your-jira-api-token" \
node build/index.js
```

5. **Use the Tools**
Once the server is running with "Jira MCP server running on stdio" message, you can use the tools:

List sprint tickets:
```typescript
<use_mcp_tool>
<server_name>list-jira-tickets-server</server_name>
<tool_name>list_sprint_tickets</tool_name>
<arguments>
{
  "maxResults": 50
}
</arguments>
</use_mcp_tool>
```

List specific tickets with JQL:
```typescript
<use_mcp_tool>
<server_name>list-jira-tickets-server</server_name>
<tool_name>list_tickets</tool_name>
<arguments>
{
  "jql": "assignee = currentUser() AND status != Done",
  "maxResults": 50
}
</arguments>
</use_mcp_tool>
```

## What is MCP?

The Model Context Protocol (MCP) is a powerful system that enables AI assistants to interact with external tools and services through a standardized interface. It acts as a bridge between AI models and real-world applications, allowing them to:

1. Execute commands and tools
2. Access resources and data
3. Interact with external services
4. Maintain state and context

### Key MCP Concepts

1. **MCP Servers**
   - Independent processes that provide tools and resources
   - Run locally on the user's machine
   - Communicate via stdio using a defined protocol
   - Can connect to external services (APIs, databases, etc.)

2. **Tools**
   - Functions that perform specific actions
   - Have defined input schemas
   - Return structured responses
   - Can be synchronous or asynchronous

3. **Resources**
   - Static or dynamic data sources
   - Accessed via URIs
   - Can be files, API responses, or other data

4. **Configuration**
   - Managed through MCP settings files
   - Environment variables for sensitive data
   - Server registration and management

## Creating an MCP Server

1. **Basic Structure**
   ```typescript
   import { Server } from '@modelcontextprotocol/sdk/server/index.js';
   
   class MyServer {
     private server: Server;
     
     constructor() {
       this.server = new Server(
         { name: 'my-server', version: '1.0.0' },
         { capabilities: { tools: {}, resources: {} } }
       );
       this.setupTools();
     }
     
     private setupTools() {
       // Define your tools here
     }
     
     async run() {
       const transport = new StdioServerTransport();
       await this.server.connect(transport);
     }
   }
   ```

2. **Defining Tools**
   ```typescript
   this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
     tools: [{
       name: 'my_tool',
       description: 'Tool description',
       inputSchema: {
         type: 'object',
         properties: {
           param1: { type: 'string' }
         }
       }
     }]
   }));
   ```

3. **Handling Tool Requests**
   ```typescript
   this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
     // Tool implementation
     return {
       content: [{ type: 'text', text: 'result' }]
     };
   });
   ```

## Integrating MCP with Any Project

1. **Create Server Template**
   ```bash
   npx @modelcontextprotocol/create-server my-server
   ```

2. **Define Integration Points**
   - Identify what functionality to expose
   - Design tool interfaces
   - Plan resource structure

3. **Implementation Steps**
   1. Set up project structure
   2. Install dependencies
   3. Create server class
   4. Define tools and resources
   5. Implement handlers
   6. Add configuration
   7. Build and test

4. **Best Practices**
   - Use TypeScript for type safety
   - Follow schema-first design
   - Implement proper error handling
   - Add comprehensive logging
   - Secure sensitive data
   - Document all tools and resources

## Real-World Integration Examples

### 1. API Integration (like our Jira example)
- Connect to external APIs
- Handle authentication
- Transform data
- Expose specific functionality

### 2. Database Integration
```typescript
class DatabaseServer {
  private server: Server;
  private db: Database;

  constructor() {
    this.server = new Server(
      { name: 'database-server', version: '1.0.0' },
      { capabilities: { tools: {} } }
    );
    this.db = new Database(/* config */);
  }

  private setupTools() {
    // Tool to query data
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [{
        name: 'query_data',
        description: 'Query database',
        inputSchema: {
          type: 'object',
          properties: {
            query: { type: 'string' },
            params: { type: 'array' }
          }
        }
      }]
    }));
  }
}
```

### 3. File System Operations
```typescript
// Tool to manage files
{
  name: 'manage_files',
  description: 'File operations',
  inputSchema: {
    type: 'object',
    properties: {
      operation: { 
        type: 'string',
        enum: ['read', 'write', 'delete']
      },
      path: { type: 'string' },
      content: { type: 'string' }
    }
  }
}
```

### 4. Custom CLI Tools
```typescript
// Wrap CLI commands as MCP tools
{
  name: 'run_command',
  description: 'Execute CLI command',
  inputSchema: {
    type: 'object',
    properties: {
      command: { type: 'string' },
      args: { type: 'array' }
    }
  }
}
```

## Common Use Cases

1. **Development Tools**
   - Git operations
   - Code analysis
   - Build processes
   - Testing frameworks

2. **System Integration**
   - Service monitoring
   - Log analysis
   - Configuration management
   - Process control

3. **Data Processing**
   - ETL operations
   - Data validation
   - Format conversion
   - Batch processing

4. **External Services**
   - Cloud APIs
   - Authentication services
   - Message queues
   - Email systems

## Integration Patterns

1. **Direct Integration**
   ```typescript
   // Connect directly to service
   class ServiceServer {
     private service: ExternalService;
     
     async connect() {
       this.service = await ExternalService.connect();
     }
   }
   ```

2. **Proxy Pattern**
   ```typescript
   // Proxy requests through adapter
   class ProxyServer {
     private adapter: ServiceAdapter;
     
     constructor() {
       this.adapter = new ServiceAdapter();
     }
   }
   ```

3. **Event-Based**
   ```typescript
   // Handle events from service
   class EventServer {
     private events: EventEmitter;
     
     constructor() {
       this.events = new EventEmitter();
       this.setupEventHandlers();
     }
   }
   ```

4. **Resource-Centric**
   ```typescript
   // Focus on resource management
   class ResourceServer {
     private resources: Map<string, Resource>;
     
     async getResource(uri: string) {
       return this.resources.get(uri);
     }
   }
   ```

## Example: Jira MCP Server

# Jira MCP Server

This MCP (Model Context Protocol) server provides tools to interact with Jira, specifically for listing tickets and sprint tasks.

## Overview

The server is built using the MCP SDK and provides two main tools:
1. `list_tickets`: For querying Jira tickets using custom JQL
2. `list_sprint_tickets`: For specifically listing tickets in the active sprint

## Project Structure

```
list-jira-tickets/
├── src/
│   └── index.ts    # Main server implementation
├── build/          # Compiled JavaScript files
├── package.json    # Project dependencies and scripts
└── tsconfig.json   # TypeScript configuration
```

## Configuration

The server requires the following environment variables:
- `JIRA_HOST`: Your Jira instance hostname (e.g., "company.atlassian.net")
- `JIRA_USERNAME`: Your Jira username/email
- `JIRA_API_TOKEN`: Your Jira API token

These are configured in the MCP settings file at:
`~/.vscode-server/data/User/globalStorage/saoudrizwan.claude-dev/settings/cline_mcp_settings.json`

```json
{
  "mcpServers": {
    "list-jira-tickets-server": {
      "command": "node",
      "args": ["/path/to/build/index.js"],
      "env": {
        "JIRA_HOST": "your-jira-host",
        "JIRA_USERNAME": "your-username",
        "JIRA_API_TOKEN": "your-api-token"
      }
    }
  }
}
```

## Available Tools

### 1. list_tickets

Lists Jira tickets based on a custom JQL query.

Parameters:
- `jql` (required): JQL query string
- `maxResults` (optional): Maximum number of tickets to return (default: 50, max: 100)

Example usage:
```typescript
<use_mcp_tool>
<server_name>list-jira-tickets-server</server_name>
<tool_name>list_tickets</tool_name>
<arguments>
{
  "jql": "assignee = \"user@example.com\" AND status != Done",
  "maxResults": 50
}
</arguments>
</use_mcp_tool>
```

### 2. list_sprint_tickets

Lists tickets in the active sprint for the configured user.

Parameters:
- `maxResults` (optional): Maximum number of tickets to return (default: 50, max: 100)

Example usage:
```typescript
<use_mcp_tool>
<server_name>list-jira-tickets-server</server_name>
<tool_name>list_sprint_tickets</tool_name>
<arguments>
{
  "maxResults": 50
}
</arguments>
</use_mcp_tool>
```

## Response Format

Both tools return tickets in the following format:
```json
[
  {
    "key": "PROJECT-123",
    "summary": "Ticket summary",
    "status": "In Progress",
    "assignee": "User Name",
    "priority": "High",
    "lastUpdated": "2024-12-23T13:59:31.560+0200"
  }
]
```

## Development

1. Install dependencies:
```bash
npm install
```

2. Build the project:
```bash
npm run build
```

3. Start the server:
```bash
node build/index.js
```

## Implementation Details

The server uses:
- `@modelcontextprotocol/sdk` for MCP server functionality
- `jira-client` for Jira API integration
- TypeScript for type safety and better development experience

Key components:
1. Environment variable handling with required checks
2. JiraApi client setup with secure authentication
3. Tool handlers for both list_tickets and list_sprint_tickets
4. Error handling and response formatting

## Troubleshooting

1. If tools are not recognized:
   - Ensure the server is running
   - Check if the MCP settings file has the correct path
   - Rebuild the project with `npm run build`

2. If authentication fails:
   - Verify your Jira API token is valid
   - Check the environment variables in the MCP settings

3. For connection issues:
   - Restart the MCP server
   - Verify the Jira host is accessible
   - Check for any network restrictions

## Notes

- The server uses stdio for communication with the MCP system
- All Jira API calls are made using HTTPS
- The server includes proper error handling and logging
- Response formatting is consistent across all tools
