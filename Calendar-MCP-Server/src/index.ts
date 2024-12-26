#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
    CallToolRequestSchema,
    ListToolsRequestSchema,
    Tool,
} from "@modelcontextprotocol/sdk/types.js";
import { google } from 'googleapis';
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { OAuth2Client } from 'google-auth-library';

// OAuth2 credentials from environment variables
const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const REFRESH_TOKEN = process.env.GOOGLE_REFRESH_TOKEN;
const REDIRECT_URI = 'http://localhost';

if (!CLIENT_ID || !CLIENT_SECRET || !REFRESH_TOKEN) {
    console.error('Error: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET and GOOGLE_REFRESH_TOKEN environment variables are required');
    process.exit(1);
}

// Create OAuth2 client and set credentials
const oauth2Client = new OAuth2Client(
    CLIENT_ID,
    CLIENT_SECRET,
    REDIRECT_URI
);

oauth2Client.setCredentials({
    refresh_token: REFRESH_TOKEN
});

// Initialize Google Calendar API
const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
const calendarId = 'primary';

// Schema definitions
const CreateEventSchema = z.object({
    summary: z.string().describe("Event title"),
    start: z.object({
        dateTime: z.string().describe("Start time (ISO format)"),
        timeZone: z.string().optional().describe("Time zone"),
    }),
    end: z.object({
        dateTime: z.string().describe("End time (ISO format)"),
        timeZone: z.string().optional().describe("Time zone"),
    }),
    description: z.string().optional().describe("Event description"),
    location: z.string().optional().describe("Event location"),
});

const GetEventSchema = z.object({
    eventId: z.string().describe("ID of the event to retrieve"),
});

const UpdateEventSchema = z.object({
    eventId: z.string().describe("ID of the event to update"),
    summary: z.string().optional().describe("New event title"),
    start: z.object({
        dateTime: z.string().describe("New start time (ISO format)"),
        timeZone: z.string().optional().describe("Time zone"),
    }).optional(),
    end: z.object({
        dateTime: z.string().describe("New end time (ISO format)"),
        timeZone: z.string().optional().describe("Time zone"),
    }).optional(),
    description: z.string().optional().describe("New event description"),
    location: z.string().optional().describe("New event location"),
});

const DeleteEventSchema = z.object({
    eventId: z.string().describe("ID of the event to delete"),
});

const ListEventsSchema = z.object({
    timeMin: z.string().describe("Start of time range (ISO format)"),
    timeMax: z.string().describe("End of time range (ISO format)"),
    maxResults: z.number().optional().describe("Maximum number of events to return"),
    orderBy: z.enum(['startTime', 'updated']).optional().describe("Sort order"),
});

// Server implementation
const server = new Server({
    name: "google-calendar",
    version: "1.0.0",
    capabilities: {
        tools: {},
    },
});

// Tool handlers
server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
        {
            name: "create_event",
            description: "Creates a new event in Google Calendar",
            inputSchema: zodToJsonSchema(CreateEventSchema),
        },
        {
            name: "get_event",
            description: "Retrieves details of a specific event",
            inputSchema: zodToJsonSchema(GetEventSchema),
        },
        {
            name: "update_event",
            description: "Updates an existing event",
            inputSchema: zodToJsonSchema(UpdateEventSchema),
        },
        {
            name: "delete_event",
            description: "Deletes an event from the calendar",
            inputSchema: zodToJsonSchema(DeleteEventSchema),
        },
        {
            name: "list_events",
            description: "Lists events within a specified time range",
            inputSchema: zodToJsonSchema(ListEventsSchema),
        },
    ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
        switch (name) {
            case "create_event": {
                const validatedArgs = CreateEventSchema.parse(args);
                const response = await calendar.events.insert({
                    calendarId,
                    requestBody: validatedArgs,
                });
                return {
                    content: [
                        {
                            type: "text",
                            text: `Event created with ID: ${response.data.id}\n` +
                                  `Title: ${validatedArgs.summary}\n` +
                                  `Start: ${validatedArgs.start.dateTime}\n` +
                                  `End: ${validatedArgs.end.dateTime}`,
                        },
                    ],
                };
            }

            case "get_event": {
                const validatedArgs = GetEventSchema.parse(args);
                const response = await calendar.events.get({
                    calendarId,
                    eventId: validatedArgs.eventId,
                });
                return {
                    content: [
                        {
                            type: "text",
                            text: JSON.stringify(response.data, null, 2),
                        },
                    ],
                };
            }

            case "update_event": {
                const validatedArgs = UpdateEventSchema.parse(args);
                const { eventId, ...updates } = validatedArgs;
                const response = await calendar.events.patch({
                    calendarId,
                    eventId,
                    requestBody: updates,
                });
                return {
                    content: [
                        {
                            type: "text",
                            text: `Event updated: ${eventId}\n` +
                                  `New title: ${updates.summary || '(unchanged)'}\n` +
                                  `New start: ${updates.start?.dateTime || '(unchanged)'}\n` +
                                  `New end: ${updates.end?.dateTime || '(unchanged)'}`,
                        },
                    ],
                };
            }

            case "delete_event": {
                const validatedArgs = DeleteEventSchema.parse(args);
                await calendar.events.delete({
                    calendarId,
                    eventId: validatedArgs.eventId,
                });
                return {
                    content: [
                        {
                            type: "text",
                            text: `Event deleted: ${validatedArgs.eventId}`,
                        },
                    ],
                };
            }

            case "list_events": {
                const validatedArgs = ListEventsSchema.parse(args);
                const response = await calendar.events.list({
                    calendarId,
                    timeMin: validatedArgs.timeMin,
                    timeMax: validatedArgs.timeMax,
                    maxResults: validatedArgs.maxResults || 10,
                    orderBy: validatedArgs.orderBy || 'startTime',
                    singleEvents: true,
                });
                return {
                    content: [
                        {
                            type: "text",
                            text: `Found ${response.data.items?.length || 0} events:\n` +
                                  JSON.stringify(response.data.items, null, 2),
                        },
                    ],
                };
            }

            default:
                throw new Error(`Unknown tool: ${name}`);
        }
    } catch (error) {
        return {
            content: [
                {
                    type: "text",
                    text: `Error: ${error instanceof Error ? error.message : String(error)}`,
                },
            ],
            isError: true,
        };
    }
});

// Start the server
const transport = new StdioServerTransport();
server.connect(transport).catch((error) => {
    console.error("Fatal error running server:", error);
    process.exit(1);
});
console.error('Google Calendar MCP Server running on stdio');