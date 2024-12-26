#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';
import JiraApi from 'jira-client';

// These will be provided by MCP config
function getRequiredEnvVar(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} environment variable is required`);
  }
  return value;
}

const JIRA_HOST = getRequiredEnvVar('JIRA_HOST');
const JIRA_USERNAME = getRequiredEnvVar('JIRA_USERNAME');
const JIRA_API_TOKEN = getRequiredEnvVar('JIRA_API_TOKEN');

class JiraServer {
  private server: Server;
  private jira: JiraApi;

  constructor() {
    this.server = new Server(
      {
        name: 'list-jira-tickets',
        version: '0.1.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.jira = new JiraApi({
      protocol: 'https',
      host: JIRA_HOST,
      username: JIRA_USERNAME,
      password: JIRA_API_TOKEN,
      apiVersion: '2',
      strictSSL: true
    });

    this.setupToolHandlers();
    
    // Error handling
    this.server.onerror = (error) => console.error('[MCP Error]', error);
    process.on('SIGINT', async () => {
      await this.server.close();
      process.exit(0);
    });
  }

  private setupToolHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: 'list_tickets',
          description: 'List Jira tickets based on JQL query',
          inputSchema: {
            type: 'object',
            properties: {
              jql: {
                type: 'string',
                description: 'JQL query to filter tickets (e.g. "project = PROJ AND status = Open")',
              },
              maxResults: {
                type: 'number',
                description: 'Maximum number of tickets to return (default: 50)',
                minimum: 1,
                maximum: 100,
              },
            },
            required: ['jql'],
          },
        },
        {
          name: 'list_sprint_tickets',
          description: 'List Jira tickets in active sprint',
          inputSchema: {
            type: 'object',
            properties: {
              maxResults: {
                type: 'number',
                description: 'Maximum number of tickets to return (default: 50)',
                minimum: 1,
                maximum: 100,
              },
            },
          },
        },
      ],
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      if (request.params.name !== 'list_tickets' && request.params.name !== 'list_sprint_tickets') {
        throw new McpError(
          ErrorCode.MethodNotFound,
          `Unknown tool: ${request.params.name}`
        );
      }

      try {
        let jql: string;
        const args = request.params.arguments as {
          jql?: string;
          maxResults?: number;
        };

        if (request.params.name === 'list_sprint_tickets') {
          jql = 'assignee = "y.khira@cequens.com" AND sprint in openSprints() ORDER BY priority DESC, updated DESC';
        } else {
          jql = args.jql!;
        }

        const issues = await this.jira.searchJira(jql, {
          maxResults: args.maxResults || 50,
          fields: ['key', 'summary', 'status', 'assignee', 'priority', 'updated'],
        });

        const formattedIssues = issues.issues.map((issue: any) => ({
          key: issue.key,
          summary: issue.fields.summary,
          status: issue.fields.status.name,
          assignee: issue.fields.assignee?.displayName || 'Unassigned',
          priority: issue.fields.priority.name,
          lastUpdated: issue.fields.updated,
        }));

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(formattedIssues, null, 2),
            },
          ],
        };
      } catch (error) {
        if (error instanceof Error) {
          return {
            content: [
              {
                type: 'text',
                text: `Error fetching Jira tickets: ${error.message}`,
              },
            ],
            isError: true,
          };
        }
        throw error;
      }
    });
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('Jira MCP server running on stdio');
  }
}

const server = new JiraServer();
server.run().catch(console.error);
